import { Platform } from "obsidian";
import type { ClaudeCodeCliSettings, LlmResponse, PromptInput } from "../types";
import type { GenerateOptions, LlmProvider } from "./llm";
import { LlmError } from "./llm";

/**
 * Claude Code CLI passthrough — primary path for users with a Claude Pro/Max
 * subscription. Plugin spawns `claude -p ... --output-format json` and parses
 * the response. Auth is handled entirely by Claude Code (OAuth on first login).
 *
 * Desktop only. On mobile, the runtime will refuse to instantiate this provider
 * and the auth method should auto-fall-back to anthropic-api.
 */

export interface CliDetectResult {
  found: boolean;
  version?: string;
  path?: string;
}

const VERSION_TIMEOUT_MS = 10_000;
const DEFAULT_TIMEOUT_SECONDS = 720;

/**
 * Node built-ins must be required lazily: this module is bundled into main.js,
 * which also loads on mobile where none of these exist. Every caller is behind
 * a Platform.isMobile guard.
 */
function nodeApis() {
  /* eslint-disable @typescript-eslint/no-var-requires -- lazy require, not import: these builtins must not be evaluated on mobile, where they don't exist */
  return {
    cp: require("child_process") as typeof import("child_process"),
    fs: require("fs") as typeof import("fs"),
    path: require("path") as typeof import("path"),
    os: require("os") as typeof import("os"),
  };
  /* eslint-enable @typescript-eslint/no-var-requires -- end of the lazy-require block above */
}

function isWindows(): boolean {
  return process.platform === "win32";
}

interface SpawnSpec {
  command: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
}

/**
 * Build the spawn invocation for a claude binary.
 *
 * An npm global install (`npm install -g @anthropic-ai/claude-code`) puts a
 * `claude.cmd` shim on Windows, not an .exe. Node refuses to spawn .cmd/.bat
 * files directly (EINVAL since the CVE-2024-27980 fix), so those are routed
 * through cmd.exe. Only pass trusted, plugin-controlled args this way — user
 * content (the prompt) must go through stdin, never the cmd.exe command line.
 */
export function buildCliSpawn(binPath: string, args: string[]): SpawnSpec {
  if (isWindows() && /\.(cmd|bat)$/i.test(binPath)) {
    const comspec = process.env.ComSpec || "cmd.exe";
    const commandLine = `"${binPath}" ${args.join(" ")}`;
    return {
      command: comspec,
      args: ["/d", "/s", "/c", `"${commandLine}"`],
      windowsVerbatimArguments: true,
    };
  }
  return { command: binPath, args };
}

interface RunCliOptions {
  timeoutMs: number;
  cwd?: string;
  stdin?: string;
}

type RunCliResult =
  | { kind: "ok"; code: number | null; stdout: string; stderr: string }
  | { kind: "timeout" }
  | { kind: "spawn-error"; message: string };

/**
 * Kill the child and, on Windows, its whole tree: a .cmd shim runs through
 * cmd.exe, and killing only cmd.exe would orphan the node process underneath.
 */
function killTree(child: import("child_process").ChildProcess): void {
  const { cp } = nodeApis();
  if (isWindows() && child.pid) {
    try {
      cp.spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
      return;
    } catch {
      // fall through to plain kill
    }
  }
  child.kill();
}

function runCli(binPath: string, args: string[], opts: RunCliOptions): Promise<RunCliResult> {
  const { cp } = nodeApis();
  return new Promise((resolve) => {
    const spec = buildCliSpawn(binPath, args);
    let child: import("child_process").ChildProcess;
    try {
      child = cp.spawn(spec.command, spec.args, {
        windowsHide: true,
        windowsVerbatimArguments: spec.windowsVerbatimArguments,
        cwd: opts.cwd,
      });
    } catch (e) {
      resolve({ kind: "spawn-error", message: (e as Error).message });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: RunCliResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      killTree(child);
      finish({ kind: "timeout" });
    }, opts.timeoutMs);
    child.stdout?.on("data", (d) => (stdout += String(d)));
    child.stderr?.on("data", (d) => (stderr += String(d)));
    child.on("error", (e) => finish({ kind: "spawn-error", message: e.message }));
    child.on("close", (code) => finish({ kind: "ok", code, stdout, stderr }));
    if (child.stdin) {
      // EPIPE if the child exits before reading; must not crash the plugin.
      child.stdin.on("error", () => undefined);
      if (opts.stdin !== undefined) child.stdin.write(opts.stdin);
      child.stdin.end();
    }
  });
}

/** Run `<bin> --version`; returns the version line or null if it failed. */
async function probeVersion(binPath: string): Promise<string | null> {
  const result = await runCli(binPath, ["--version"], { timeoutMs: VERSION_TIMEOUT_MS });
  if (result.kind !== "ok" || result.code !== 0) return null;
  const line = result.stdout.trim().split("\n")[0]?.trim();
  return line || null;
}

/** Shape of `claude -p --output-format json` output (the fields we read). */
interface CliJsonPayload {
  subtype?: string;
  is_error?: boolean;
  result?: unknown;
  total_cost_usd?: unknown;
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
  modelUsage?: Record<string, unknown>;
}

function parseCliJson(stdout: string): LlmResponse {
  const text = stdout.trim();
  let parsed: CliJsonPayload;
  try {
    parsed = JSON.parse(text) as CliJsonPayload;
  } catch {
    // Diagnostic noise can leak onto stdout ahead of the payload; the JSON
    // object itself is emitted as the last line.
    const line = text
      .split("\n")
      .reverse()
      .find((l) => l.trim().startsWith("{"));
    if (!line) {
      throw new LlmError(`Claude Code returned unparseable output: ${text.slice(0, 300)}`);
    }
    try {
      parsed = JSON.parse(line) as CliJsonPayload;
    } catch {
      throw new LlmError(`Claude Code returned unparseable output: ${text.slice(0, 300)}`);
    }
  }

  if (parsed.is_error || typeof parsed.result !== "string") {
    const detail =
      typeof parsed.result === "string" ? parsed.result : parsed.subtype ?? "unknown error";
    throw new LlmError(`Claude Code reported an error: ${detail}`);
  }

  const usage = parsed.usage ?? {};
  return {
    text: parsed.result,
    inputTokens: typeof usage.input_tokens === "number" ? usage.input_tokens : undefined,
    outputTokens: typeof usage.output_tokens === "number" ? usage.output_tokens : undefined,
    costUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : undefined,
    modelUsed: pickMainModel(parsed.modelUsage),
  };
}

/**
 * modelUsage can list several models (e.g. a haiku helper alongside the main
 * one); report the model that produced the most output tokens.
 */
function pickMainModel(modelUsage?: Record<string, unknown>): string | undefined {
  if (!modelUsage) return undefined;
  let best: string | undefined;
  let bestTokens = -1;
  for (const [model, raw] of Object.entries(modelUsage)) {
    const tokens =
      raw && typeof (raw as { outputTokens?: unknown }).outputTokens === "number"
        ? ((raw as { outputTokens: number }).outputTokens)
        : 0;
    if (tokens > bestTokens) {
      bestTokens = tokens;
      best = model;
    }
  }
  return best;
}

/** Resolve a bare command name to concrete path(s) using the OS lookup tool. */
async function resolveFromPath(name: string): Promise<string[]> {
  if (isWindows()) {
    // where.exe lives in System32, so it is reachable even when Obsidian
    // inherits a minimal PATH. It also applies PATHEXT, which plain spawn
    // of a bare name would not.
    const result = await runCli("where.exe", [name], { timeoutMs: VERSION_TIMEOUT_MS });
    if (result.kind !== "ok" || result.code !== 0) return [];
    return result.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/\.ps1$/i.test(l));
  }
  const quoted = `'${name.replace(/'/g, "'\\''")}'`;
  const result = await runCli("/bin/sh", ["-c", `command -v -- ${quoted}`], {
    timeoutMs: VERSION_TIMEOUT_MS,
  });
  if (result.kind !== "ok" || result.code !== 0) return [];
  const line = result.stdout.trim().split("\n")[0]?.trim();
  return line ? [line] : [];
}

/**
 * Ask npm where its global prefix is. Covers npm installs under version
 * managers (nvm-windows, volta, fnm...) whose prefix none of the static
 * guesses would hit. Best-effort: returns null when npm itself is missing.
 */
async function queryNpmGlobalPrefix(): Promise<string | null> {
  const result = isWindows()
    ? await runCli("npm.cmd", ["prefix", "-g"], { timeoutMs: VERSION_TIMEOUT_MS })
    : await runCli("/bin/sh", ["-c", "npm prefix -g"], { timeoutMs: VERSION_TIMEOUT_MS });
  if (result.kind !== "ok" || result.code !== 0) return null;
  const line = result.stdout.trim().split("\n")[0]?.trim();
  return line || null;
}

/** nvm keeps one bin dir per node version; try them newest-first. */
function nvmCandidates(home: string): string[] {
  const { fs, path } = nodeApis();
  const versionsDir = path.join(home, ".nvm", "versions", "node");
  try {
    return fs
      .readdirSync(versionsDir)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((v) => path.join(versionsDir, v, "bin", "claude"));
  } catch {
    return [];
  }
}

/**
 * Every path worth probing, in priority order:
 * user hint > PATH > native installer > npm global installs.
 */
async function candidateBinaries(binaryHint: string): Promise<string[]> {
  const { fs, path, os } = nodeApis();
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (p: string | undefined | null, mustExist: boolean) => {
    if (!p) return;
    const key = isWindows() ? p.toLowerCase() : p;
    if (seen.has(key)) return;
    seen.add(key);
    if (mustExist && !fs.existsSync(p)) return;
    out.push(p);
  };

  const hint = binaryHint.trim();
  if (hint) {
    if (hint.includes("/") || hint.includes("\\")) {
      push(hint, true);
    } else {
      // A bare name like "claude-canary" — resolve it like the shell would.
      for (const p of await resolveFromPath(hint)) push(p, false);
    }
  }

  for (const p of await resolveFromPath("claude")) push(p, false);

  const home = os.homedir();
  if (isWindows()) {
    // Native installer: irm https://claude.ai/install.ps1 | iex
    push(path.join(home, ".local", "bin", "claude.exe"), true);
    // npm global: default user prefix, then the system-Node prefix.
    if (process.env.APPDATA) {
      push(path.join(process.env.APPDATA, "npm", "claude.cmd"), true);
    }
    for (const pf of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
      if (pf) push(path.join(pf, "nodejs", "claude.cmd"), true);
    }
  } else {
    // Native installer: curl -fsSL https://claude.ai/install.sh | bash
    push(path.join(home, ".local", "bin", "claude"), true);
    // npm global installs under common prefixes.
    push("/usr/local/bin/claude", true);
    push("/opt/homebrew/bin/claude", true);
    push(path.join(home, ".npm-global", "bin", "claude"), true);
    push(path.join(home, ".volta", "bin", "claude"), true);
    for (const p of nvmCandidates(home)) push(p, true);
  }

  // Last resort: whatever prefix npm is actually configured with.
  if (out.length === 0) {
    const prefix = await queryNpmGlobalPrefix();
    if (prefix) {
      const p = isWindows()
        ? path.join(prefix, "claude.cmd")
        : path.join(prefix, "bin", "claude");
      push(p, true);
    }
  }

  return out;
}

let cachedDetect: CliDetectResult | null = null;
let cachedDetectHint: string | null = null;

export class ClaudeCodeCliProvider implements LlmProvider {
  readonly id = "claude-code-cli";

  constructor(
    private settings: ClaudeCodeCliSettings,
    private vaultRoot: string
  ) {
    if (Platform.isMobile) {
      throw new LlmError("Claude Code CLI provider is desktop-only.");
    }
  }

  async generate(input: PromptInput, opts?: GenerateOptions): Promise<LlmResponse> {
    // On the .cmd shim path --model rides the cmd.exe command line, so only a
    // strict token is allowed through; anything else is rejected up front.
    const model = opts?.model ?? (this.settings.model.trim() || undefined);
    if (model && !/^[A-Za-z0-9._-]+$/.test(model)) {
      throw new LlmError(
        `Invalid model name '${model}'. Use an alias like sonnet, opus, haiku, or a full model id.`
      );
    }

    const detected = await ClaudeCodeCliProvider.detect(this.settings.binaryPath);
    if (!detected.found || !detected.path) {
      throw new LlmError(
        "Claude Code not found. Install it from claude.ai/code or via npm " +
          "(npm install -g @anthropic-ai/claude-code), or switch to an API key in settings."
      );
    }

    // The prompt goes through stdin, never the command line: it is user
    // content, and on the .cmd shim path the command line passes through
    // cmd.exe (see buildCliSpawn). Claude Code manages prompt caching itself,
    // so the system block is simply concatenated ahead of the user content.
    const args = [
      "-p",
      "--output-format",
      "json",
      "--permission-mode",
      this.settings.permissionMode,
    ];
    if (model) args.push("--model", model);

    const timeoutSeconds =
      this.settings.timeoutSeconds > 0 ? this.settings.timeoutSeconds : DEFAULT_TIMEOUT_SECONDS;
    const stdinPayload = input.system ? `${input.system}\n\n${input.user}` : input.user;
    const run = await runCli(detected.path, args, {
      timeoutMs: timeoutSeconds * 1000,
      cwd: this.resolveCwd(),
      stdin: stdinPayload,
    });

    if (run.kind === "timeout") {
      throw new LlmError(
        `Claude Code took longer than ${timeoutSeconds}s. ` +
          "Try a shorter memo or raise the timeout in settings."
      );
    }
    if (run.kind === "spawn-error") {
      throw new LlmError(
        `Could not start Claude Code (${run.message}). Check the binary path in settings.`
      );
    }
    if (run.code !== 0) {
      const noise = `${run.stderr}\n${run.stdout}`;
      if (/not logged in|please run \/login|invalid api key|authentication_error|oauth token/i.test(noise)) {
        throw new LlmError(
          "Claude Code is not logged in. Run 'claude' in a terminal, sign in, then retry."
        );
      }
      const detail = (run.stderr || run.stdout).trim().slice(-500);
      throw new LlmError(`Claude Code exited with code ${run.code}: ${detail}`);
    }

    return parseCliJson(run.stdout);
  }

  async ping(): Promise<{ ok: boolean; detail?: string }> {
    if (Platform.isMobile) {
      return { ok: false, detail: "Claude Code CLI is desktop-only." };
    }
    const result = await ClaudeCodeCliProvider.detect(this.settings.binaryPath, true);
    if (!result.found) {
      return {
        ok: false,
        detail:
          "Claude Code not found. Install it from claude.ai/code (native installer) " +
          "or via npm (npm install -g @anthropic-ai/claude-code), " +
          "or set the binary path in settings.",
      };
    }
    return { ok: true, detail: `${result.version} (${result.path})` };
  }

  /**
   * Find a working claude binary. Probes, in order: the user-supplied hint,
   * PATH, the native installer location, and npm global install locations
   * (default prefixes plus whatever `npm prefix -g` reports). A candidate
   * counts only if `--version` actually succeeds. Result is cached for the
   * session; pass force=true to re-probe (e.g. from "Test connection").
   */
  static async detect(binaryHint: string, force = false): Promise<CliDetectResult> {
    if (Platform.isMobile) return { found: false };
    const hint = (binaryHint ?? "").trim();
    if (!force && cachedDetect && cachedDetectHint === hint) return cachedDetect;

    let result: CliDetectResult = { found: false };
    for (const candidate of await candidateBinaries(hint)) {
      const version = await probeVersion(candidate);
      if (version) {
        result = { found: true, version, path: candidate };
        break;
      }
    }
    cachedDetect = result;
    cachedDetectHint = hint;
    return result;
  }

  private resolveCwd(): string {
    return this.settings.workingDirectory === "custom"
      ? this.settings.customWorkingDirectory || this.vaultRoot
      : this.vaultRoot;
  }
}
