import { Platform } from "obsidian";
import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import type { ClaudeCodeCliSettings, LlmResponse, PromptInput } from "../types";
import type { GenerateOptions, LlmProvider } from "./llm";
import { LlmError } from "./llm";

/**
 * Claude Code CLI passthrough — primary path for users with a Claude Pro/Max
 * subscription. Plugin spawns `claude -p --output-format json` and parses
 * the response. Auth is handled entirely by Claude Code (OAuth on first login).
 *
 * Desktop only. On mobile, the runtime will refuse to instantiate this provider
 * and the auth method should auto-fall-back to anthropic-api.
 */
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
    const binary = await this.resolveBinary();
    const args = ["-p", "--output-format", "json", "--permission-mode", this.settings.permissionMode];
    if (opts?.model) args.push("--model", opts.model);

    // Claude Code CLI manages prompt caching internally (see usage.cache_*
    // fields in its JSON output), so we hand it the concatenated prompt.
    const stdinPayload = input.system ? `${input.system}\n\n${input.user}` : input.user;
    const stdout = await this.spawnCollect(binary, args, stdinPayload);
    let parsed: ClaudeCodeJsonResult;
    try {
      parsed = JSON.parse(stdout) as ClaudeCodeJsonResult;
    } catch (err) {
      throw new LlmError(
        `Claude Code returned non-JSON output (first 200 chars): ${stdout.slice(0, 200)}`,
        err
      );
    }

    const text = typeof parsed.result === "string" ? parsed.result : "";
    if (!text) {
      throw new LlmError("Claude Code returned an empty result.");
    }
    return {
      text,
      inputTokens: parsed.usage?.input_tokens,
      outputTokens: parsed.usage?.output_tokens,
      costUsd: parsed.total_cost_usd,
      modelUsed: parsed.model ?? firstKey(parsed.modelUsage),
    };
  }

  async ping(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const detected = await ClaudeCodeCliProvider.detect(this.settings.binaryPath);
      if (!detected.found) return { ok: false, detail: "claude binary not found on PATH" };
      return { ok: true, detail: `version ${detected.version ?? "(unknown)"} at ${detected.path}` };
    } catch (err) {
      return { ok: false, detail: (err as Error).message };
    }
  }

  static async detect(binaryHint: string): Promise<{ found: boolean; version?: string; path?: string }> {
    if (Platform.isMobile) return { found: false };
    const candidates = ClaudeCodeCliProvider.candidatePaths(binaryHint);
    for (const candidate of candidates) {
      const version = await ClaudeCodeCliProvider.tryVersion(candidate);
      if (version) return { found: true, version, path: candidate };
    }
    return { found: false };
  }

  private static candidatePaths(binaryHint: string): string[] {
    const list: string[] = [];
    if (binaryHint && binaryHint.trim()) list.push(binaryHint.trim());
    list.push("claude");
    if (process.platform === "win32") {
      const local = process.env.LOCALAPPDATA;
      const programFiles = process.env["ProgramFiles"];
      if (local) list.push(path.join(local, "Programs", "claude", "claude.exe"));
      if (programFiles) list.push(path.join(programFiles, "claude", "claude.exe"));
    } else {
      list.push("/usr/local/bin/claude", "/opt/homebrew/bin/claude");
      if (process.env.HOME) {
        list.push(path.join(process.env.HOME, ".local", "bin", "claude"));
        list.push(path.join(process.env.HOME, ".claude", "local", "claude"));
      }
    }
    return list;
  }

  private static tryVersion(binary: string): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const proc = spawn(binary, ["--version"], { windowsHide: true });
        let out = "";
        proc.stdout.on("data", (chunk) => (out += String(chunk)));
        proc.on("error", () => resolve(null));
        proc.on("close", (code) => {
          if (code !== 0) {
            resolve(null);
            return;
          }
          const match = out.match(/(\d+\.\d+\.\d+\S*)/);
          resolve(match ? match[1] : out.trim() || "unknown");
        });
      } catch {
        resolve(null);
      }
    });
  }

  private async resolveBinary(): Promise<string> {
    const hint = this.settings.binaryPath?.trim();
    if (hint) {
      if (path.isAbsolute(hint) && !fs.existsSync(hint)) {
        throw new LlmError(`Configured binary path does not exist: ${hint}`);
      }
      return hint;
    }
    const detected = await ClaudeCodeCliProvider.detect("");
    if (!detected.found) {
      throw new LlmError(
        "Claude Code not found. Install it from claude.ai/code or set the binary path in settings."
      );
    }
    return detected.path ?? "claude";
  }

  private spawnCollect(binary: string, args: string[], stdinPayload: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const cwd = this.resolveCwd();
      const timeoutMs = Math.max(5, this.settings.timeoutSeconds) * 1000;
      const proc = spawn(binary, args, { cwd, windowsHide: true });
      let stdout = "";
      let stderr = "";

      const timer = setTimeout(() => {
        proc.kill();
        reject(
          new LlmError(
            `Claude Code timed out after ${this.settings.timeoutSeconds}s. Raise the timeout in settings or shorten the memo.`
          )
        );
      }, timeoutMs);

      proc.stdout.on("data", (chunk) => (stdout += String(chunk)));
      proc.stderr.on("data", (chunk) => (stderr += String(chunk)));
      // Swallow stdin errors (e.g. the binary closed stdin before we finished
      // writing). The real failure surfaces via 'error' or non-zero 'close'.
      proc.stdin.on("error", () => {});
      proc.on("error", (err) => {
        clearTimeout(timer);
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          reject(
            new LlmError(
              "Claude Code not found. Install it from claude.ai/code or switch to API key in settings."
            )
          );
          return;
        }
        reject(new LlmError(`Failed to spawn Claude Code: ${err.message}`, err));
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          if (/not logged in|please log in/i.test(stderr)) {
            reject(new LlmError("Claude Code is not logged in. Run `claude login` and retry."));
            return;
          }
          reject(new LlmError(`Claude Code exited with code ${code}: ${stderr.trim() || "(no stderr)"}`));
          return;
        }
        resolve(stdout);
      });

      proc.stdin.write(stdinPayload);
      proc.stdin.end();
    });
  }

  private resolveCwd(): string {
    return this.settings.workingDirectory === "custom"
      ? this.settings.customWorkingDirectory || this.vaultRoot
      : this.vaultRoot;
  }
}

interface ClaudeCodeJsonResult {
  result?: string;
  model?: string;
  modelUsage?: Record<string, unknown>;
  usage?: { input_tokens?: number; output_tokens?: number };
  total_cost_usd?: number;
}

function firstKey(obj: Record<string, unknown> | undefined): string | undefined {
  if (!obj) return undefined;
  const keys = Object.keys(obj);
  return keys.length > 0 ? keys[0] : undefined;
}
