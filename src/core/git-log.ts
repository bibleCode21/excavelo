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
 * The source of truth is the repository's default branch, never a branch tip:
 * work counts as done when it has landed there. Each entry on the base's
 * first-parent history is one *landing*. A landing with two or more parents is
 * a merge and expands to the commits it brought in; any other landing is
 * itself the work (a direct commit, a squash-merge commit, a rebased commit).
 * That is why no merge strategy needs detecting.
 *
 * Branch selection needs no configuration: when the memo body contains branch
 * names (e.g. lines pasted from git output, `branch-name  subject`), the
 * landings carrying those names are emitted. Pasted branches are an explicit
 * selection, so no date window is applied unless the spec sets one.
 * `branches:<glob>` selects the same way (default window: last 7 days). Name
 * filtering only ever applies to landings that *have* a name — a squash,
 * rebase, or direct landing has none and is always emitted, or it would be
 * dropped for lacking what it cannot have. A selected branch whose work has
 * not landed gets a `--- not yet on <base>` section instead, never counted as
 * shipped. A repository with no selection contributes every landing in the
 * window (default: last 7 days) and no not-yet-landed sections.
 *
 * See docs/specs/git-log-master-source.md — in particular why reachability is
 * not a landed-predicate, and what degrades in a squash/rebase repository.
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

/**
 * Minimal local shapes for the Node globals/modules this file touches.
 * Obsidian's community-plugin submission linter type-checks source files
 * without installing devDependencies, so @types/node (and the require/process
 * globals it declares) is unresolvable there even though it's present in this
 * project's own tsconfig — leaving every require()/process access "unsafe" by
 * that linter's typescript-eslint rules. Declaring these locally (shadowing
 * the ambient @types/node versions when they do resolve, without conflicting
 * with them — verified) makes the file self-contained either way.
 */
declare function require(id: string): unknown;
declare const process: { platform: string; env: Record<string, string | undefined> };
interface NodeChildProcess {
  readonly pid?: number;
  readonly stdout: { on(event: "data", listener: (chunk: unknown) => void): void } | null;
  readonly stderr: { on(event: "data", listener: (chunk: unknown) => void): void } | null;
  kill(): void;
  on(event: "error", listener: (err: Error) => void): void;
  on(event: "close", listener: (code: number | null) => void): void;
}
interface NodeChildProcessModule {
  spawn(command: string, args: string[], options?: Record<string, unknown>): NodeChildProcess;
}
interface NodeFsModule {
  existsSync(path: string): boolean;
}
interface NodeOsModule {
  homedir(): string;
}

/**
 * Lazy require: this module is bundled into main.js, which also loads on mobile.
 * The isDesktop check below is redundant with loadGitLog's own isMobile guard —
 * it exists only so eslint-plugin-obsidianmd's no-nodejs-modules rule, which
 * looks for a guard local to this function, is satisfied. isDesktopApp would be
 * the semantically apt field (Node availability, not UI mode), but the rule
 * string-matches "isDesktop" literally — do not "fix" this to isDesktopApp.
 */
function nodeApis() {
  if (!Platform.isDesktop) throw new Error(t("git.desktop-only"));
  // guarded require, not import: the ESM form this rule prefers fails at runtime under
  // Obsidian's loader (measured). obsidianmd/no-nodejs-modules explicitly permits
  // require() behind the Platform.isDesktop guard above.
  return {
    cp: require("child_process") as NodeChildProcessModule,
    fs: require("fs") as NodeFsModule,
    os: require("os") as NodeOsModule,
  };
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
      let child: NodeChildProcess;
      try {
        child = cp.spawn(bin, args, { windowsHide: true });
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      let stdout = "";
      let stderr = "";
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        fn();
      };
      const timer = window.setTimeout(() => {
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
        if ((e as { code?: string }).code !== "ENOENT") throw e;
      }
    }
    const err = lastError ?? new Error("git not found");
    if (err instanceof Error) throw err;
    // Every rejection this module produces is already an Error (spawn-catch, timeout,
    // child "error" event) — this branch is unreachable today. JSON.stringify can itself
    // throw (circular refs) or return undefined (functions/symbols), so guard both.
    let message: string | undefined;
    try {
      message = JSON.stringify(err);
    } catch {
      // circular reference — fall through to the default message below.
    }
    throw new Error(message ?? "git not found (non-Error rejection)");
  })();
}

function expandHome(p: string): string {
  if (!p.startsWith("~")) return p;
  const { os } = nodeApis();
  return os.homedir() + p.slice(1);
}

/**
 * A glob longer than this matches nothing (falls through to git.no-branches):
 * no real branch filter needs it, and it bounds globMatch's glob.length factor
 * so an unbounded merge-subject can never multiply against an unbounded glob.
 */
const MAX_GLOB_LENGTH = 200;

/**
 * `feature/2026/*` matches `feature/2026/x` — `*` crosses slashes, `?` is one
 * char, everything else is a literal (case-insensitive). Deliberately not
 * regex-based: a chained-`.*` translation of a multi-`*` glob backtracks
 * exponentially against an adversarial subject, and merge subjects put text of
 * unbounded length from other people's repositories through here. This is the
 * standard two-pointer wildcard matcher (no recursion, no backtracking beyond
 * retrying the most recent `*`) — worst case O(text.length * glob.length),
 * never exponential, but still quadratic if both factors are unbounded. Text
 * length is out of this function's control (a third party's commit subject),
 * so glob length is what MAX_GLOB_LENGTH bounds.
 */
function globMatch(text: string, glob: string): boolean {
  if (glob.length > MAX_GLOB_LENGTH) return false;
  const s = text.toLowerCase();
  const p = glob.toLowerCase();
  let si = 0;
  let pi = 0;
  let starIdx = -1;
  let starSi = 0;
  while (si < s.length) {
    if (pi < p.length && (p[pi] === "?" || p[pi] === s[si])) {
      si++;
      pi++;
    } else if (pi < p.length && p[pi] === "*") {
      starIdx = pi;
      starSi = si;
      pi++;
    } else if (starIdx !== -1) {
      pi = starIdx + 1;
      starSi++;
      si = starSi;
    } else {
      return false;
    }
  }
  while (pi < p.length && p[pi] === "*") pi++;
  return pi === p.length;
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
 * This is what work has to land on to count as done; without it there is
 * nothing to source from and the caller falls back to a plain HEAD log.
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

/**
 * One event that put work on the base. `branch` is set only for a merge whose
 * subject names its source; every other landing has no branch name to carry.
 */
interface Landing {
  hash: string;
  parents: string[];
  /** Committer date — the date --since/--until filter on, so always in window. */
  date: string;
  subject: string;
  branch: string | null;
}

/**
 * A merge landing's source branch, read off the merge subject. Returns null
 * when no known format matches; the caller then shows the raw subject rather
 * than a guessed name — less signal beats a wrong label.
 */
function parseMergeBranchName(subject: string): string | null {
  const patterns = [
    // `Merge branch 'x'`, with or without a trailing `into 'y'`.
    /^Merge branch '([^']+)'/i,
    // `Merge remote-tracking branch 'origin/x'` — the remote prefix is dropped.
    /^Merge remote-tracking branch '(?:[^/']+\/)?([^']+)'/i,
    // `Merge pull request #12 from org/x`.
    /^Merge pull request #\d+ from [^/\s]+\/(\S+)/i,
  ];
  for (const re of patterns) {
    const m = subject.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Landings on the base's first-parent history, newest first. Deliberately
 * uncapped: the cap belongs after selection, since a selected branch's landing
 * must survive even when it is neither recent nor inside a default window.
 * In pasted mode there is no window at all, so this walks the whole history
 * and only the git timeout bounds it — affordable because a first-parent walk
 * emits one short line per commit.
 */
async function enumerateLandings(
  repoPath: string,
  base: string,
  since: string | null,
  until: string | null
): Promise<Landing[]> {
  const result = await runGit([
    "-C",
    repoPath,
    "log",
    "--first-parent",
    base,
    ...(since ? [`--since=${since}`] : []),
    ...(until ? [`--until=${until}`] : []),
    "--date=short",
    "--no-color",
    "--pretty=format:%H\t%P\t%cd\t%s",
  ]);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim().split("\n")[0] ?? "git log --first-parent failed");
  }
  const out: Landing[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [hash, parents, date, ...rest] = line.split("\t");
    if (!hash) continue;
    const parentList = parents ? parents.split(" ").filter(Boolean) : [];
    const subject = rest.join("\t");
    out.push({
      hash,
      parents: parentList,
      date: date ?? "",
      subject,
      branch: parentList.length >= 2 ? parseMergeBranchName(subject) : null,
    });
  }
  return out;
}

function landingHeader(landing: Landing): string {
  if (landing.parents.length >= 2) {
    return landing.branch
      ? `--- landed ${landing.date} branch: ${landing.branch}`
      : `--- landed ${landing.date} merge: ${landing.subject}`;
  }
  return `--- landed ${landing.date} direct`;
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

/** Runs one rendering `git log`, mapping every failure onto the git.failed contract. */
async function runLog(args: string[], spec: GitSpec): Promise<string> {
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
  return result.stdout.trim();
}

/** One `--- landed` section per landing that has commits to show. */
async function loadLandingSections(
  repoPath: string,
  spec: GitSpec,
  landings: Landing[]
): Promise<string[]> {
  const sections: string[] = [];
  for (const landing of landings.slice(0, MAX_BRANCHES)) {
    // A merge's own commits, from every non-first parent: identical to
    // M^1..M^2 for an ordinary two-parent merge, and still correct for an
    // octopus merge, where M^1..M^2 would silently drop the third parent on.
    // No date window inside a landing — the landing is already in the window
    // and its commits may well predate it, which is the point.
    const args =
      landing.parents.length >= 2
        ? [...logArgs(repoPath, null, null), `${landing.hash}^@`, "--not", `${landing.hash}^1`]
        : [...logArgs(repoPath, null, null), "--no-walk", landing.hash];
    const body = await runLog(args, spec);
    if (!body) continue;
    sections.push(`${landingHeader(landing)}\n${body}`);
  }
  if (landings.length > MAX_BRANCHES) {
    sections.push(
      `(only the ${MAX_BRANCHES} most recent of ${landings.length} landings were rendered)`
    );
  }
  return sections;
}

/**
 * One `--- not yet on <base>` section per selected branch whose work has not
 * landed. This is the old `--not <base>` query — the branch's own commits,
 * not shared history — narrowed by --cherry-pick, which also drops commits
 * whose patch landed under a different hash (rebase, cherry-pick).
 *
 * It cannot see through a squash: N commits' patches never equal one squashed
 * patch, so a squash-landed branch still looks unlanded here. `landedNames`
 * catches that only when the squash subject named the branch, which GitHub and
 * GitLab do not do by default. The residual is real and closed at the prompt
 * layer (a landed section wins) — see the work contract.
 */
async function loadNotLandedSections(
  repoPath: string,
  spec: GitSpec,
  base: string,
  branches: BranchRef[],
  since: string | null,
  landedNames: Set<string>
): Promise<string[]> {
  const sections: string[] = [];
  // Both exclusions belong in the filter: applied inside the loop instead, the
  // base would eat a slot under the cap and silently drop a real branch.
  const considered = branches.filter(
    (b) => b.ref !== base && !landedNames.has(b.display.toLowerCase())
  );
  for (const branch of considered.slice(0, MAX_BRANCHES)) {
    const args = [
      ...logArgs(repoPath, since, spec.until),
      `${base}...${branch.ref}`,
      "--right-only",
      "--cherry-pick",
    ];
    const body = await runLog(args, spec);
    if (!body) continue;
    sections.push(`--- not yet on ${base} branch: ${branch.display}\n${body}`);
  }
  if (considered.length > MAX_BRANCHES) {
    sections.push(
      `(only the ${MAX_BRANCHES} most recently updated of ${considered.length} unlanded branches were scanned)`
    );
  }
  return sections;
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
 * Work is sourced from what landed on each repository's default branch;
 * commits that only exist on an unlanded branch are labelled as such and
 * never reported as shipped.
 *
 * `memoText` (the raw memo body) drives automatic branch selection: branch
 * names pasted into the memo select the landings that carry them.
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

    const base = await resolveBaseRef(repoPath);
    if (!base) {
      // Nothing to source from — fall back to a plain log of what is checked
      // out rather than reporting nothing.
      const since = spec.since ?? DEFAULT_SINCE;
      const body = await runLog(logArgs(repoPath, since, spec.until), spec);
      const header = `repository: ${spec.path} (${windowLabel(since, spec.until)})`;
      parts.push(`${header}\n${body || "(no commits in this window)"}`);
      continue;
    }

    // Pasted branches are an explicit selection, so no default date window;
    // every other mode keeps the 7-day default. Which of those applies is only
    // known once this repository's landings have been read, so read at the
    // widest window the spec allows and narrow below if nothing selects here.
    // Reading narrow first would miss a landing older than the default window
    // whose branch has since been deleted, and fall through when it should not.
    const hasPastedCandidates = !spec.branches && candidates.length > 0;
    let since = hasPastedCandidates ? spec.since : spec.since ?? DEFAULT_SINCE;

    const readLandings = async (from: string | null): Promise<Landing[]> => {
      try {
        return await enumerateLandings(repoPath, base, from, spec.until);
      } catch (e) {
        throw new Error(t("git.failed", { path: spec.path, error: (e as Error).message }));
      }
    };
    let landings = await readLandings(since);

    let branches: BranchRef[] = [];
    if (spec.branches || candidates.length > 0) {
      try {
        branches = await enumerateBranches(repoPath);
      } catch (e) {
        throw new Error(t("git.failed", { path: spec.path, error: (e as Error).message }));
      }
    }

    // `hit` decides which *named* landings survive; a nameless landing has no
    // name to match and is never filtered by one.
    let hit: ((name: string | null) => boolean) | null = null;
    let selectedBranches: BranchRef[] = [];
    let note = "";

    if (spec.branches) {
      const glob = spec.branches;
      const match = (name: string | null) => name !== null && globMatch(name, glob);
      selectedBranches = branches.filter((b) => globMatch(b.display, glob) || globMatch(b.ref, glob));
      if (selectedBranches.length === 0 && !landings.some((l) => match(l.branch))) {
        throw new Error(t("git.no-branches", { glob: spec.branches, path: spec.path }));
      }
      hit = match;
      note = `, branches ${spec.branches}`;
    } else if (candidates.length > 0) {
      const wanted = new Set(candidates.map((c) => c.toLowerCase()));
      const match = (name: string | null) => name !== null && wanted.has(name.toLowerCase());
      selectedBranches = branches.filter(
        (b) => wanted.has(b.display.toLowerCase()) || wanted.has(b.ref.toLowerCase())
      );
      if (selectedBranches.length > 0 || landings.some((l) => match(l.branch))) {
        hit = match;
        note = ", branches named in the memo";
      }
      // Nothing pasted exists in this repository — fall through to no
      // selection. The window has to come back with it: `candidates` are
      // shared across every spec, so a name that matched elsewhere must not
      // strand this repository on an unbounded walk.
    }

    const hasSelection = hit !== null;
    if (!hasSelection && since === null) {
      since = DEFAULT_SINCE;
      landings = await readLandings(since);
    }

    // Name filtering runs here, before loadLandingSections applies the cap:
    // selecting out of an already-capped set would let the cap evict the very
    // landing the user asked for. Matched named landings are placed ahead of
    // nameless ones for the same reason — nameless landings always pass this
    // filter (no name to reject them by), so a repository that also takes
    // frequent direct-to-base commits could otherwise fill every cap slot with
    // nameless landings and evict the one landing that was actually selected.
    const selected = hit
      ? [
          ...landings.filter((l) => l.branch !== null && hit(l.branch)),
          ...landings.filter((l) => l.branch === null),
        ]
      : landings;

    const sections = await loadLandingSections(repoPath, spec, selected);
    if (hasSelection) {
      const landedNames = new Set(
        landings.flatMap((l) => (l.branch ? [l.branch.toLowerCase()] : []))
      );
      sections.push(
        ...(await loadNotLandedSections(repoPath, spec, base, selectedBranches, since, landedNames))
      );
    }

    const header = `repository: ${spec.path} (${windowLabel(since, spec.until)}${note})`;
    parts.push(`${header}\n${sections.join("\n\n") || "(no commits in this window)"}`);
  }
  return parts.join("\n\n");
}
