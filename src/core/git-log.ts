import { Platform } from "obsidian";
import { t } from "../i18n";

/**
 * Reads commit history from local repositories named in [!git] callouts and
 * formats it for the LLM prompt. Desktop only — spawns the git binary.
 *
 * Spec syntax (one per callout line, several lines = several repositories):
 * a repository path, optionally followed by `since:` / `until:` / `branches:`
 * tokens:
 *
 *   D:/git/excavelo
 *   D:/git/excavelo since:2026-07-01 until:2026-07-05
 *   /Users/me/work since:7d
 *   ~/work since:today
 *   C:/git/groupware branches:feature/2026/*
 *
 * Paths may contain spaces — every token that is not a known key belongs to
 * the path. Dates: ISO (passed through), `today`, or `<N>d` (N days ago).
 *
 * Branch selection needs no configuration: when the memo body contains
 * branch names (e.g. lines pasted from git output, `branch-name  subject`),
 * every pasted name that actually exists in a listed repository is looked up
 * and gets its own `--- branch: <name>` section, with commits already on the
 * default branch (origin/HEAD) subtracted so a section is that branch's own
 * work. Pasted branches are an explicit selection, so no date window is
 * applied unless the spec sets one. `branches:<glob>` instead scans every
 * matching branch (default window: last 7 days). A repository where neither
 * applies contributes a plain log of the checked-out branch (default window:
 * last 7 days).
 */

export interface GitSpec {
  path: string;
  /** null = the user gave no since:; each mode picks its own default. */
  since: string | null;
  until: string | null;
  branches: string | null;
}

const DEFAULT_SINCE = "7 days ago";
const GIT_TIMEOUT_MS = 30_000;
const MAX_COMMITS = 200;
const MAX_BRANCHES = 50;

export function parseGitSpec(raw: string): GitSpec {
  const tokens = raw.trim().split(/\s+/);
  const pathParts: string[] = [];
  let since: string | null = null;
  let until: string | null = null;
  let branches: string | null = null;
  for (const token of tokens) {
    const m = token.match(/^(since|until|branch|branches):(.+)$/i);
    if (m) {
      const key = m[1].toLowerCase();
      if (key === "since") since = normalizeDate(m[2]);
      else if (key === "until") until = normalizeDate(m[2]);
      else branches = m[2];
    } else {
      pathParts.push(token);
    }
  }
  return { path: pathParts.join(" "), since, until, branches };
}

function normalizeDate(v: string): string {
  const trimmed = v.trim();
  if (/^today$/i.test(trimmed)) return "midnight";
  const days = trimmed.match(/^(\d+)d$/i);
  if (days) return `${days[1]} days ago`;
  return trimmed; // ISO dates and anything git itself understands
}

/**
 * Tokens in the memo that could be branch names: contain a slash, use only
 * git-ref characters. Only candidates that actually exist as branches in a
 * listed repository are used, so stray file paths or URLs cannot match.
 */
export function branchCandidates(memoText: string): string[] {
  const out = new Set<string>();
  for (const raw of memoText.split(/\s+/)) {
    const token = raw.replace(/^[([{<'"`*]+/, "").replace(/[)\]}>'"`*.,;:!?]+$/, "");
    if (!token.includes("/")) continue;
    if (!/^[A-Za-z0-9._/-]+$/.test(token)) continue;
    if (token.includes("//") || token.startsWith("/") || token.endsWith("/")) continue;
    out.add(token);
  }
  return [...out];
}

/** Lazy require: this module is bundled into main.js, which also loads on mobile. */
function nodeApis() {
  /* eslint-disable @typescript-eslint/no-var-requires -- lazy require, not import: these builtins must not be evaluated on mobile, where they don't exist */
  return {
    cp: require("child_process") as typeof import("child_process"),
    fs: require("fs") as typeof import("fs"),
    os: require("os") as typeof import("os"),
  };
  /* eslint-enable @typescript-eslint/no-var-requires -- end of the lazy-require block above */
}

function gitCandidates(): string[] {
  const out = ["git"];
  if (process.platform === "win32") {
    for (const pf of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]]) {
      if (pf) out.push(`${pf}\\Git\\cmd\\git.exe`);
    }
  } else {
    out.push("/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git");
  }
  return out;
}

function runGit(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const { cp } = nodeApis();
  const tryOne = (bin: string) =>
    new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      let child: import("child_process").ChildProcess;
      try {
        child = cp.spawn(bin, args, { windowsHide: true });
      } catch (e) {
        reject(e);
        return;
      }
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(() => reject(new Error("git log timed out")));
      }, GIT_TIMEOUT_MS);
      child.stdout?.on("data", (d) => (stdout += String(d)));
      child.stderr?.on("data", (d) => (stderr += String(d)));
      child.on("error", (e) => finish(() => reject(e)));
      child.on("close", (code) => finish(() => resolve({ code, stdout, stderr })));
    });

  return (async () => {
    let lastError: unknown;
    for (const bin of gitCandidates()) {
      try {
        return await tryOne(bin);
      } catch (e) {
        lastError = e;
        // ENOENT -> try the next candidate; anything else is a real failure.
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    throw lastError ?? new Error("git not found");
  })();
}

function expandHome(p: string): string {
  if (!p.startsWith("~")) return p;
  const { os } = nodeApis();
  return os.homedir() + p.slice(1);
}

/** `feature/2026/*` -> /^feature\/2026\/.*$/i — `*` crosses slashes, `?` is one char. */
function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

interface BranchRef {
  /** Name without the remote prefix — what the LLM sees and matching uses. */
  display: string;
  /** Ref as git log accepts it (e.g. origin/feature/x). */
  ref: string;
}

/**
 * All local and remote-tracking branches, newest tip first. A branch that
 * exists both locally and on a remote appears once, keeping whichever tip is
 * more recent.
 */
async function enumerateBranches(repoPath: string): Promise<BranchRef[]> {
  const result = await runGit([
    "-C",
    repoPath,
    "for-each-ref",
    "--sort=-committerdate",
    "--format=%(refname)%09%(refname:short)",
    "refs/heads",
    "refs/remotes",
  ]);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim().split("\n")[0] ?? "git for-each-ref failed");
  }
  const seen = new Set<string>();
  const out: BranchRef[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const [full, short] = line.split("\t");
    if (!full || !short) continue;
    if (/^refs\/remotes\/[^/]+\/HEAD$/.test(full)) continue;
    const display = full.startsWith("refs/remotes/")
      ? short.split("/").slice(1).join("/")
      : short;
    if (!display || seen.has(display)) continue;
    seen.add(display);
    out.push({ display, ref: short });
  }
  return out;
}

/**
 * The repo's default branch (origin/HEAD or a main/master fallback), if any.
 * Best-effort: without a base the branch logs just include shared history.
 */
async function resolveBaseRef(repoPath: string): Promise<string | null> {
  try {
    const head = await runGit([
      "-C",
      repoPath,
      "symbolic-ref",
      "--quiet",
      "--short",
      "refs/remotes/origin/HEAD",
    ]);
    if (head.code === 0) {
      const name = head.stdout.trim();
      if (name) return name;
    }
    for (const candidate of ["origin/main", "origin/master", "main", "master"]) {
      const probe = await runGit(["-C", repoPath, "rev-parse", "--verify", "--quiet", candidate]);
      if (probe.code === 0) return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

function logArgs(repoPath: string, since: string | null, until: string | null): string[] {
  return [
    "-C",
    repoPath,
    "log",
    `--max-count=${MAX_COMMITS}`,
    ...(since ? [`--since=${since}`] : []),
    ...(until ? [`--until=${until}`] : []),
    "--date=short",
    "--no-color",
    "--stat",
    "--pretty=format:%n=== %h %ad %an%n%s%n%b",
  ];
}

/** One `--- branch:` section per given branch that has commits to show. */
async function loadBranchLogs(
  repoPath: string,
  spec: GitSpec,
  branches: BranchRef[],
  since: string | null
): Promise<string> {
  const base = await resolveBaseRef(repoPath);
  const sections: string[] = [];
  for (const branch of branches.slice(0, MAX_BRANCHES)) {
    // base..branch: only the branch's own commits, not shared history. A
    // branch cut from another feature branch still inherits that branch's
    // commits — the work-log template tells the LLM how to attribute those.
    const args = [
      ...logArgs(repoPath, since, spec.until),
      branch.ref,
      ...(base && base !== branch.ref ? ["--not", base] : []),
    ];
    let result;
    try {
      result = await runGit(args);
    } catch (e) {
      throw new Error(t("git.failed", { path: spec.path, error: (e as Error).message }));
    }
    if (result.code !== 0) {
      const detail = result.stderr.trim().split("\n")[0] ?? "";
      throw new Error(t("git.failed", { path: spec.path, error: detail }));
    }
    const body = result.stdout.trim();
    if (!body) continue;
    sections.push(`--- branch: ${branch.display}\n${body}`);
  }
  if (branches.length > MAX_BRANCHES) {
    sections.push(
      `(only the ${MAX_BRANCHES} most recently updated of ${branches.length} matching branches were scanned)`
    );
  }
  return sections.join("\n\n") || "(no matching branch commits)";
}

function windowLabel(since: string | null, until: string | null): string {
  const parts = [since ? `since ${since}` : "all history"];
  if (until) parts.push(`until ${until}`);
  return parts.join(", ");
}

/**
 * Loads commit history for every [!git] spec. Per commit: short hash, date,
 * subject, body, and a diffstat — enough for work reports without full diffs.
 * A path that is missing or not a git repository is an error, not a silent
 * memo-only transform.
 *
 * `memoText` (the raw memo body) drives automatic branch selection: branch
 * names pasted into the memo are looked up in each repository.
 */
export async function loadGitLog(specs: string[], memoText = ""): Promise<string | null> {
  if (specs.length === 0) return null;
  if (Platform.isMobile) {
    throw new Error(t("git.desktop-only"));
  }
  const { fs } = nodeApis();
  const candidates = branchCandidates(memoText);
  const parts: string[] = [];
  for (const raw of specs) {
    const spec = parseGitSpec(raw);
    if (!spec.path) {
      throw new Error(t("git.no-path"));
    }
    const repoPath = expandHome(spec.path);
    if (!fs.existsSync(repoPath)) {
      throw new Error(t("git.path-missing", { path: spec.path }));
    }

    if (spec.branches) {
      // Explicit glob: scan every matching branch within the window.
      let all: BranchRef[];
      try {
        all = await enumerateBranches(repoPath);
      } catch (e) {
        throw new Error(t("git.failed", { path: spec.path, error: (e as Error).message }));
      }
      const regex = globToRegExp(spec.branches);
      const matched = all.filter((b) => regex.test(b.display) || regex.test(b.ref));
      if (matched.length === 0) {
        throw new Error(t("git.no-branches", { glob: spec.branches, path: spec.path }));
      }
      const since = spec.since ?? DEFAULT_SINCE;
      const body = await loadBranchLogs(repoPath, spec, matched, since);
      const header = `repository: ${spec.path} (${windowLabel(since, spec.until)}, branches ${spec.branches})`;
      parts.push(`${header}\n${body}`);
      continue;
    }

    if (candidates.length > 0) {
      // Branch names pasted into the memo: use the ones this repo has. An
      // explicit selection, so no default date window.
      let all: BranchRef[];
      try {
        all = await enumerateBranches(repoPath);
      } catch (e) {
        throw new Error(t("git.failed", { path: spec.path, error: (e as Error).message }));
      }
      const wanted = new Set(candidates.map((c) => c.toLowerCase()));
      const matched = all.filter(
        (b) => wanted.has(b.display.toLowerCase()) || wanted.has(b.ref.toLowerCase())
      );
      if (matched.length > 0) {
        const body = await loadBranchLogs(repoPath, spec, matched, spec.since);
        const header = `repository: ${spec.path} (${windowLabel(spec.since, spec.until)}, branches named in the memo)`;
        parts.push(`${header}\n${body}`);
        continue;
      }
      // No pasted branch exists here — fall through to the plain log.
    }

    const since = spec.since ?? DEFAULT_SINCE;
    let result;
    try {
      result = await runGit(logArgs(repoPath, since, spec.until));
    } catch (e) {
      throw new Error(t("git.failed", { path: spec.path, error: (e as Error).message }));
    }
    if (result.code !== 0) {
      const detail = result.stderr.trim().split("\n")[0] ?? "";
      throw new Error(t("git.failed", { path: spec.path, error: detail }));
    }
    const header = `repository: ${spec.path} (${windowLabel(since, spec.until)})`;
    parts.push(`${header}\n${result.stdout.trim() || "(no commits in this window)"}`);
  }
  return parts.join("\n\n");
}
