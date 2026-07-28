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
 * rebase, or direct landing has none and is always emitted, though under a
 * selection it is bounded by the window so a pasted name cannot dump the whole
 * history.
 *
 * A selected branch is then *confirmed* against the base by three paths, in
 * order: a landing whose message names it (which needs no ref, so a branch
 * deleted after its squash still counts), every base-unique commit subject
 * resolving to exactly one landing, or plain ancestry. A branch none of them
 * confirms is reported nowhere at all — this file states what reached the
 * base, and a guess about the rest is worse than silence.
 *
 * A name confirmation is window-invariant: once a landing names a selected
 * branch, narrowing the window never drops that branch from the output. If
 * the landing itself renders (in the window, under the cap), the branch is
 * reported in full; otherwise it still gets a header-only
 * `--- confirmed landed on <base> branch: <name> (landed <date>)` line.
 *
 * See docs/specs/git-log-master-source.md for the landing traversal,
 * docs/specs/git-log-landed-confirmation.md for the predicate above, and
 * docs/specs/git-log-named-window-invariance.md for the window-invariance
 * rule — in particular why tree-content comparison is not one of the
 * predicate's paths.
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

/** Only `~` and `~/...` resolve (the current user's home) — `~user` names a
 * different user's home, which this codebase has no way to look up, so it is
 * left untouched rather than glued onto homedir() with no separator. */
export function expandHome(p: string): string {
  if (p !== "~" && !p.startsWith("~/")) return p;
  const { os } = nodeApis();
  return p === "~" ? os.homedir() : os.homedir() + p.slice(1);
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
    const display = full.startsWith("refs/remotes/") ? dropRemotePrefix(short) : short;
    if (!display || seen.has(display)) continue;
    seen.add(display);
    out.push({ display, ref: short });
  }
  return out;
}

/**
 * A branch is selected when either name form — `display` or the `ref` git
 * log itself accepts — satisfies `test`. Both selection modes in loadGitLog
 * (a `branches:` glob, pasted names from the memo) share exactly this shape;
 * only what `test` checks differs between them.
 */
function selectBranches(branches: BranchRef[], test: (name: string) => boolean): BranchRef[] {
  return branches.filter((b) => test(b.display) || test(b.ref));
}

/** `origin/feature/x` -> `feature/x`. The display rule for any remote-tracking ref. */
function dropRemotePrefix(short: string): string {
  return short.split("/").slice(1).join("/");
}

/**
 * Whether `name` refers to the base, in either of its two forms. The contract
 * excludes the base from the predicate *entirely* — every path, not just the
 * ones that query git — because `merge-base --is-ancestor <base> <base>` exits
 * 0 and a landing message routinely mentions the base by name, so without this
 * the base confirms itself and the work log gains an entry for a branch called
 * `main`.
 *
 * Comparing the raw ref is not enough: enumerateBranches dedups by display and
 * prefers the local ref, so an ordinary clone whose local `main` tracks
 * `origin/main` lists {display:"main", ref:"main"} while resolveBaseRef returns
 * `origin/main`. Both forms have to match.
 */
function namesBase(base: BranchRef, name: string): boolean {
  const n = name.toLowerCase();
  return n === base.ref.toLowerCase() || n === base.display.toLowerCase();
}

/**
 * The repo's default branch (origin/HEAD or a main/master fallback), if any.
 * This is what work has to land on to count as done; without it there is
 * nothing to source from and the caller falls back to a plain HEAD log.
 */
async function resolveBaseRef(repoPath: string): Promise<BranchRef | null> {
  // `display` runs through the same rule enumerateBranches applies, so the base
  // can be recognised in that list however it was reached — an ordinary clone
  // lists its local `main` while the base resolves to `origin/main`, and
  // comparing raw refs would miss it. Sharing the helper is what keeps the two
  // from drifting apart; namesBase's correctness depends on them agreeing.
  const remote = (ref: string): BranchRef => ({ ref, display: dropRemotePrefix(ref) });
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
      if (name) return remote(name);
    }
    for (const candidate of ["origin/main", "origin/master"]) {
      const probe = await runGit(["-C", repoPath, "rev-parse", "--verify", "--quiet", candidate]);
      if (probe.code === 0) return remote(candidate);
    }
    for (const candidate of ["main", "master"]) {
      const probe = await runGit(["-C", repoPath, "rev-parse", "--verify", "--quiet", candidate]);
      if (probe.code === 0) return { ref: candidate, display: candidate };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * One event that put work on the base. `branch` is a name the landing is known
 * by, from either of two sources: parsed off a merge subject, or assigned by
 * the landed predicate when the landing's message names a selected branch. The
 * second case is what gives a single-parent squash landing a name at all.
 */
interface Landing {
  hash: string;
  parents: string[];
  /** Committer date — the date --since/--until filter on, so always in window. */
  date: string;
  subject: string;
  /**
   * Subject and body together — what the landed predicate searches. Read here
   * rather than through one `git log --grep` per candidate name (the form the
   * work contract states) because the walk is already happening: git's
   * `-F -i --grep` matches a substring of exactly this text, so searching it in
   * memory gives the same verdict without spawning git once per branch.
   */
  message: string;
  branch: string | null;
}

/**
 * A landing that undoes or redoes another one is never evidence that work
 * landed: a revert's subject quotes the original verbatim, so leaving it in
 * would let a reverted commit confirm itself, and a reapply's quoting would
 * push a genuinely re-landed subject past the exactly-one bound the predicate
 * requires. Measured: one subject in the reference repository matches 5
 * landings raw and exactly 1 after this filter.
 */
function isRevertOrReapply(landing: Landing): boolean {
  return /^(Revert|Reapply) "/.test(landing.subject);
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
 * The landed predicate reads it with no window at all, so that call walks the
 * whole history and only the git timeout bounds it — affordable because a
 * first-parent walk emits one line per commit. Rendering reads it again,
 * windowed; see loadGitLog for which landing kind takes which window.
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
    // NUL separates records and \x01 separates fields: the body is multi-line
    // and a subject may itself contain a tab, so neither newlines nor tabs can
    // delimit this. NUL is genuinely unforgeable — git refuses to write a
    // commit message containing one, three ways over. \x01 is *not*: git
    // accepts it, and what keeps a planted one from forging a field is the
    // `...rest` rejoin below, which folds every extra split back into the body.
    // Do not replace that rejoin with a fixed-arity destructure.
    "--pretty=format:%x00%H%x01%P%x01%cd%x01%s%x01%b",
  ]);
  if (result.code !== 0) {
    throw new Error(result.stderr.trim().split("\n")[0] ?? "git log --first-parent failed");
  }
  const out: Landing[] = [];
  for (const record of result.stdout.split("\0")) {
    if (!record.trim()) continue;
    const [hash, parents, date, subject, ...rest] = record.split("\x01");
    if (!hash) continue;
    const parentList = parents ? parents.split(" ").filter(Boolean) : [];
    const subjectText = subject ?? "";
    const body = rest.join("\x01");
    out.push({
      hash,
      parents: parentList,
      date: date ?? "",
      subject: subjectText,
      message: body ? `${subjectText}\n${body}` : subjectText,
      branch: parentList.length >= 2 ? parseMergeBranchName(subjectText) : null,
    });
  }
  return out;
}

/**
 * `landing.branch`/`landing.subject` come straight off the merge commit's own
 * `%s` (enumerateLandings), never through runLog — escape them here too, or
 * a forged `--- landed` line planted in a merge subject (git's %s stops only
 * at `\n`, so a raw `\r` survives inside it and reads as a line boundary to
 * both this file's own escape regex and to the LLM) renders unescaped.
 */
function landingHeader(landing: Landing): string {
  // A name is a name whatever put it there: parsed off a merge subject, or
  // assigned by the landed predicate because the landing's message named the
  // branch. The second case is single-parent by definition — a squash — which
  // is exactly the landing that used to have no way to carry a name.
  if (landing.branch) {
    return `--- landed ${landing.date} branch: ${escapeMarkerLines(landing.branch)}`;
  }
  if (landing.parents.length >= 2) {
    return `--- landed ${landing.date} merge: ${escapeMarkerLines(landing.subject)}`;
  }
  return `--- landed ${landing.date} direct`;
}

/**
 * NUL separates records and `\x01` separates fields — the same reasoning as
 * enumerateLandings' own format (NUL is a byte git refuses to let a commit
 * message contain, so it is a genuinely unforgeable record boundary). Unlike
 * the old `--pretty=format:%n=== %h %ad %an%n%s%n%b`, the `=== hash date
 * author` line itself is no longer printed by git — runLog builds it from
 * the parsed `hash`/`date` fields instead, which is what lets `=== ` become
 * escapable content everywhere else (see escapeMarkerLines).
 */
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
    "--pretty=format:%x00%h\x01%ad\x01%an\x01%s\x01%b",
  ];
}

/**
 * `--- ` and `=== ` (optionally indented) at the start of a line are reserved
 * for this file's own section headers (`--- landed ...`, `--- confirmed
 * landed on ...`) and its own commit-record marker (`=== hash date author`) —
 * indentation is tolerated on the *input* side because an LLM reads a
 * slightly-indented line as the same sentinel even though this file itself
 * never emits one indented. A commit belongs to whichever repository a
 * [!git] callout names, so its author/subject/body is attacker-controlled and
 * out of this codebase's control. The stakes rose when not-yet-landed
 * sections were removed: prompt.ts now tells the LLM that *every* section in
 * the log is work that shipped, so a forged `--- landed` line — or, since
 * runLog builds `=== ` lines from parsed fields rather than passing git's own
 * literal through, a forged `=== ` commit record — planted in a commit is
 * believed outright rather than merely competing with a real one. Every
 * caller that interpolates commit-sourced text next to this file's own header
 * syntax must run it through here first — currently runLog's parsed fields
 * (every commit-rendering path), landingHeader's subject/branch interpolation
 * (above), and loadConfirmedSections' header and subject list.
 *
 * `^` under /m recognises only LF, CR, LS and PS as line starts, but git keeps
 * VT (0x0b), FF (0x0c) and NEL (0x85) in a commit message verbatim, and a
 * renderer downstream may well treat those as breaks. They are matched
 * explicitly rather than trusted to be harmless.
 */
function escapeMarkerLines(text: string): string {
  return text.replace(/(^|[\v\f\u0085])([ \t]*)(--- |=== )/gm, "$1$2\\$3");
}

/**
 * Runs one rendering `git log` and reconstructs its record text field by
 * field, mapping every failure onto the git.failed contract. `hash`/`date`
 * come straight off git's own formatting (a hex string; `YYYY-MM-DD` under
 * `--date=short`) and are never attacker-influenced, so they are used
 * verbatim to build this file's own `=== hash date author` line. `author`,
 * `subject`, and `rest` (the commit body, plus whatever `--stat` appends
 * after it — `--stat` is not a `%`-placeholder, so its diffstat text lands in
 * the same NUL-delimited chunk, after the body) are each attacker-controlled
 * and are each run through escapeMarkerLines before being interpolated. The
 * `...rest` rejoin (mirroring enumerateLandings') folds back together
 * anything past the fourth `\x01` — a commit message may itself contain a
 * literal `\x01`, which is not what delimits a field here; only the NUL is.
 */
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
  const records: string[] = [];
  for (const chunk of result.stdout.split("\0")) {
    if (!chunk) continue;
    const [hash, date, author, subject, ...rest] = chunk.split("\x01");
    if (!hash) continue;
    records.push(
      `\n=== ${hash} ${date ?? ""} ${escapeMarkerLines(author ?? "")}\n` +
        `${escapeMarkerLines(subject ?? "")}\n${escapeMarkerLines(rest.join("\x01"))}`
    );
  }
  return records.join("").trim();
}

/**
 * One `--- landed` section per landing that has commits to show. Also
 * returns which landings actually got one — a named landing that the window,
 * the cap, or an empty body dropped still needs to be told apart from a
 * landing that never existed, and only the caller that also holds `judged`
 * can do that (see the header-only derivation in loadGitLog).
 */
async function loadLandingSections(
  repoPath: string,
  spec: GitSpec,
  landings: Landing[]
): Promise<{ sections: string[]; rendered: Landing[] }> {
  const sections: string[] = [];
  const rendered: Landing[] = [];
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
    rendered.push(landing);
  }
  if (landings.length > MAX_BRANCHES) {
    sections.push(
      `(only the ${MAX_BRANCHES} most recent of ${landings.length} landings were rendered)`
    );
  }
  return { sections, rendered };
}

/**
 * A landing that names this branch, or null. The bound is exactly one match:
 * `branchCandidates` accepts any slash-bearing token, so a memo mentioning a
 * file path puts that path through here, and file paths recur across many
 * commit messages. Uniqueness rejects them.
 *
 * The match is a whole token, not a bare substring (see mentionsName), so
 * `feature/n1` does not match a message naming `feature/n10` — sibling names
 * under a ticket-prefixed convention are routine, and without the bound a
 * whole family of real branches would be unconfirmable.
 */
function landingsNaming(landings: Landing[], names: string[]): Map<string, Landing | null> {
  const needles = names.map((n) => [n, n.toLowerCase()] as const);
  // Every name is matched in one pass so each message is lower-cased once, not
  // once per candidate: a merge subject is unbounded third-party text (A14
  // exercises 100k characters of it), and re-folding that per name is what
  // turns a linear scan into a measurable cost.
  const found = new Map<string, Landing | null>();
  for (const landing of landings) {
    if (isRevertOrReapply(landing)) continue;
    const haystack = landing.message.toLowerCase();
    for (const [name, needle] of needles) {
      if (!mentionsName(haystack, needle)) continue;
      found.set(name, found.has(name) ? null : landing); // second match = ambiguous
    }
  }
  return found;
}

/** Characters git allows in a ref name — what a branch name cannot end against. */
const REF_CHAR = /[A-Za-z0-9._/-]/;

/**
 * Whether `haystack` names this branch, as a whole token rather than as a bare
 * substring. Both sides matter and for different reasons:
 *
 * - It stops `feature/n1` from matching a message that names `feature/n10`,
 *   which a bare `includes` cannot tell apart — the ticket-prefixed conventions
 *   this feature was built against make sibling names routine.
 * - It narrows the blast radius of the fact that a *landing message is
 *   third-party text*. Anyone able to land one commit on the base can write
 *   another person's branch name into it, and this predicate would then report
 *   that person's unlanded branch as shipped. A token bound does not close
 *   that — a deliberate mention still confirms, which is the accepted residual
 *   the contract states — but it does stop the far more common accidental hit,
 *   where the name appears inside a longer path, URL, or identifier.
 *
 * Both arguments must already be lower-cased; the caller folds the message once
 * per landing rather than once per candidate.
 */
function mentionsName(haystack: string, needle: string): boolean {
  for (let from = 0; ; from = from + 1) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : haystack[at - 1];
    const after = haystack[at + needle.length] ?? "";
    if (!REF_CHAR.test(before) && !REF_CHAR.test(after)) return true;
    from = at;
  }
}

/** A commit subject resolves when exactly one landing's message carries it. */
function resolvesUniquely(subject: string, landings: Landing[]): boolean {
  if (!subject) return false;
  let hits = 0;
  for (const landing of landings) {
    if (isRevertOrReapply(landing)) continue;
    if (!landing.message.includes(subject)) continue;
    if (++hits > 1) return false;
  }
  return hits === 1;
}

/** Maps every runGit failure — rejection included — onto the git.failed contract. */
async function runPredicateGit(
  args: string[],
  spec: GitSpec
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  try {
    return await runGit(args);
  } catch (e) {
    throw new Error(t("git.failed", { path: spec.path, error: (e as Error).message }));
  }
}

/**
 * Subjects of the commits on `ref` that the base does not have. Empty subjects
 * are kept, not filtered: a commit that carries no subject can never resolve
 * against a landing, and dropping it here would let the caller reach an
 * unresolved count of zero by discarding the very commit it could not account
 * for — a branch with unlanded work reported as shipped.
 */
async function branchSubjects(
  repoPath: string,
  spec: GitSpec,
  base: string,
  ref: string,
  cherryPick: boolean
): Promise<string[]> {
  const result = await runPredicateGit(
    [
      "-C",
      repoPath,
      "log",
      `${base}...${ref}`,
      "--right-only",
      ...(cherryPick ? ["--cherry-pick"] : []),
      "--no-color",
      "--pretty=format:%s",
    ],
    spec
  );
  if (result.code !== 0) {
    const detail = result.stderr.trim().split("\n")[0] ?? "";
    throw new Error(t("git.failed", { path: spec.path, error: detail }));
  }
  return result.stdout === "" ? [] : result.stdout.split(/\r?\n/);
}

/**
 * Whether `ref` is already part of the base's history. Unlike every other git
 * call in this file, a non-zero exit is an *answer* here, not a failure:
 * `--is-ancestor` reports "no" with exit 1. Any other code (128 for a bad ref,
 * or null when the child died on a signal) keeps the git.failed contract.
 *
 * `--` separates the option list from the two revisions: a ref may legally be
 * named `-evil/x`, and git would otherwise read it as an unknown switch and
 * exit 129, failing the whole transform for every repository in the callout.
 */
async function isAncestor(
  repoPath: string,
  spec: GitSpec,
  ref: string,
  base: string
): Promise<boolean> {
  const result = await runPredicateGit(
    ["-C", repoPath, "merge-base", "--is-ancestor", "--", ref, base],
    spec
  );
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  const detail = result.stderr.trim().split("\n")[0] ?? "";
  throw new Error(t("git.failed", { path: spec.path, error: detail }));
}

/**
 * One `--- confirmed landed on <base>` section per selected branch this proves
 * landed without a landing naming it — path 2 (every base-unique commit's
 * subject resolves against the landing history) and path 3 (the branch is an
 * ancestor of the base, which no subject comparison can see because a
 * fast-forwarded branch has no base-unique commits at all).
 *
 * The label deliberately stays outside the `--- landed ` prefix: that prefix
 * selects landed sections, and a fourth label aliasing it would silently
 * re-scope every count over them.
 *
 * A branch neither path confirms contributes nothing — not even a marker. That
 * is the point: this file reports what reached the base, and a guess about the
 * rest is worse than silence.
 */
/**
 * The confirmed-section header, shared by paths 2/3 (no date — no single
 * landing is identified) and the name-confirmed case in loadGitLog (a date,
 * because path 1 or a merge-parse did identify exactly one).
 */
function confirmedHeader(base: BranchRef, name: string, date?: string): string {
  const suffix = date ? ` (landed ${date})` : "";
  return `--- confirmed landed on ${escapeMarkerLines(base.ref)} branch: ${escapeMarkerLines(name)}${suffix}`;
}

async function loadConfirmedSections(
  repoPath: string,
  spec: GitSpec,
  base: BranchRef,
  branches: BranchRef[],
  landings: Landing[],
  namedAlready: Set<string>
): Promise<string[]> {
  const sections: string[] = [];
  // namesBase is applied again here rather than trusted from the caller: this
  // is the one exclusion the contract states predicate-wide, and paths 2 and 3
  // are where the base would confirm itself trivially.
  const eligible = branches.filter(
    (b) =>
      !namesBase(base, b.ref) &&
      !namesBase(base, b.display) &&
      !namedAlready.has(b.display.toLowerCase())
  );
  // The cap bounds the *scan*, not just the confirmations: a selection where
  // nothing confirms would otherwise spawn one or two git processes for every
  // selected branch, and a shared remote's branch count is not this file's to
  // trust.
  const considered = eligible.slice(0, MAX_BRANCHES);
  for (const branch of considered) {
    // Windowless on purpose: a window here would let an old unresolved commit
    // fall outside it and read as resolved.
    const unique = await branchSubjects(repoPath, spec, base.ref, branch.ref, false);
    let body: string | null = null;
    if (unique.length > 0) {
      const unresolved = await branchSubjects(repoPath, spec, base.ref, branch.ref, true);
      if (unresolved.every((s) => resolvesUniquely(s, landings))) {
        body = unique.map((s) => escapeMarkerLines(s)).join("\n");
      }
    } else if (await isAncestor(repoPath, spec, branch.ref, base.ref)) {
      // Its commits *are* base commits and no range recovers which were its
      // work, so the header alone is the honest maximum.
      body = "";
    }
    if (body === null) continue;
    // Escape the interpolations, never the header itself — it opens with the
    // very syntax this escapes. `base` and `display` are ref names, which git's
    // syntax rules already keep free of spaces and control characters, but
    // running them through keeps this file's stated rule true with no exception
    // a reader has to go verify.
    const header = confirmedHeader(base, branch.display);
    sections.push(`${header}${body ? `\n${body}` : ""}`);
  }
  if (eligible.length > MAX_BRANCHES) {
    sections.push(
      `(only the first ${MAX_BRANCHES} of ${eligible.length} selected branches were examined)`
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
 * Work is sourced from what landed on each repository's default branch. Work
 * that has not landed there is not reported at all — a selected branch this
 * file cannot prove landed contributes nothing, not even a marker.
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

    const readLandings = async (from: string | null, to: string | null): Promise<Landing[]> => {
      try {
        return await enumerateLandings(repoPath, base.ref, from, to);
      } catch (e) {
        throw new Error(t("git.failed", { path: spec.path, error: (e as Error).message }));
      }
    };

    // `hit` decides which *named* landings survive; a nameless landing has no
    // name to match and is never filtered by one.
    let hit: ((name: string | null) => boolean) | null = null;
    let selectedBranches: BranchRef[] = [];
    let judged: Landing[] = [];
    let note = "";

    if (spec.branches || candidates.length > 0) {
      // The predicate never sees a window: one applied here would let an old
      // unlanded commit fall outside it and read as landed. The spec's window
      // governs rendering, below.
      judged = await readLandings(null, null);
      let branches: BranchRef[];
      try {
        branches = await enumerateBranches(repoPath);
      } catch (e) {
        throw new Error(t("git.failed", { path: spec.path, error: (e as Error).message }));
      }

      // Both modes reduce to the same thing — a set of candidate names — so the
      // predicate below cannot tell how a branch was selected, which is right:
      // how it was picked has no bearing on whether it landed.
      // `names` is the predicate's input and the base is excluded from it — all
      // three paths, not just the two that query git. `branches:*` matches the
      // base and `origin/master` is a valid pasted candidate, so leaving it in
      // lets path 1 name a landing after the base itself: `hotfix applied
      // straight to main` is enough, and path 1 queries nothing, so an
      // exclusion applied only where git is called misses it entirely.
      //
      // `test` is deliberately *not* filtered. It decides selection membership,
      // and A12 fixes that on whether a candidate matched something at all —
      // narrowing it would make `branches:*` raise git.no-branches in a repo
      // whose only branch is the default, and would drop merge-parsed names
      // (J1 keeps those on their existing path).
      let test: (name: string) => boolean;
      let names: string[];
      if (spec.branches) {
        const glob = spec.branches;
        test = (name: string) => globMatch(name, glob);
        selectedBranches = selectBranches(branches, test);
        names = selectedBranches.map((b) => b.display).filter((n) => !namesBase(base, n));
        note = `, branches ${spec.branches}`;
      } else {
        const wanted = new Set(candidates.map((c) => c.toLowerCase()));
        test = (name: string) => wanted.has(name.toLowerCase());
        selectedBranches = selectBranches(branches, test);
        names = candidates.filter((c) => !namesBase(base, c));
        note = ", branches named in the memo";
      }
      // A name path 1 assigned is selected by construction, but it is stored in
      // the ref's display form, which `test` may not recognise — pasting only
      // `origin/feature/x` puts that spelling in the candidate set while the
      // landing is labelled `feature/x`. Without this the landing would be
      // named and then filtered straight back out.
      const assigned = new Set<string>();
      // A selected branch's two spellings (display and ref) name the same
      // branch, but `test` was built from whichever spelling did the
      // selecting: `selectBranches` matches either, so a branch selected only
      // by its ref form still yields a BranchRef carrying both. A
      // merge-parsed name is always the branch's *display* form (git-log.ts
      // doc comment on parseMergeBranchName), so pasting/globbing the ref
      // form alone would otherwise select the branch while never matching
      // the landing that names it. Folding both spellings of every selected
      // branch into the match is what selectBranches already does one level
      // up; this is the same rule applied where a landing's own name is
      // matched.
      const selectedSpellings = new Set<string>();
      for (const b of selectedBranches) {
        selectedSpellings.add(b.display.toLowerCase());
        selectedSpellings.add(b.ref.toLowerCase());
      }
      const match = (name: string | null) =>
        name !== null &&
        (test(name) || assigned.has(name.toLowerCase()) || selectedSpellings.has(name.toLowerCase()));

      // The rendered name is the ref's display form whenever a ref exists, so
      // pasting `origin/feature/x` and `feature/x` label the landing
      // identically; only a name with no ref left to resolve against — the
      // deleted-after-squash case — renders as pasted.
      const displayOf = (name: string) =>
        selectedBranches.find(
          (b) =>
            b.display.toLowerCase() === name.toLowerCase() ||
            b.ref.toLowerCase() === name.toLowerCase()
        )?.display ?? name;

      // Path 1 — a landing whose message names the branch. This is what sees
      // through a squash: the landing keeps no ref and no parent to trace, but
      // a message that names its source is proof enough, and it works for a
      // branch whose ref was deleted after merging. A landing that already
      // carries a name keeps it, which is what makes the rendered name
      // deterministic when two *distinct* candidates match one landing —
      // first-in-memo wins rather than last. (Two spellings of the *same*
      // branch cannot conflict: displayOf folds them to one name first.)
      const namedBy = landingsNaming(judged, names);
      for (const name of names) {
        const landing = namedBy.get(name);
        if (landing && landing.branch === null) {
          landing.branch = displayOf(name);
          assigned.add(landing.branch.toLowerCase());
        }
      }

      if (spec.branches && selectedBranches.length === 0 && !judged.some((l) => match(l.branch))) {
        throw new Error(t("git.no-branches", { glob: spec.branches, path: spec.path }));
      }
      // Whether this repository is in a selection mode still turns on whether
      // anything matched here — not on whether the predicate confirmed it —
      // so a memo whose only slash-tokens are file paths still falls through.
      if (selectedBranches.length > 0 || judged.some((l) => match(l.branch))) hit = match;
    }

    const sections: string[] = [];
    let since: string | null;

    if (hit) {
      // Whatever window the spec supplied bounds every landing kind. Only the
      // *default* is split: a pasted selection gives named landings no default
      // (a branch that landed a month ago must still report), while nameless
      // ones take it, or that same selection would dump the base's entire
      // first-parent history — measured at 55k characters against one repo. A
      // glob keeps the 7-day default outright, as it always has.
      // "Supplied a window" means either token. Adding the default alongside a
      // bare `until:` would produce `7 days ago .. <a past date>` — an empty
      // range that deletes the landings it was meant to bound.
      const specWindowed = spec.since !== null || spec.until !== null;
      since = spec.branches && !specWindowed ? DEFAULT_SINCE : spec.since;
      const namelessSince = specWindowed ? spec.since : DEFAULT_SINCE;
      const inSpecWindow =
        since !== null || spec.until !== null
          ? new Set((await readLandings(since, spec.until)).map((l) => l.hash))
          : null;
      // Identical arguments would mean the same walk twice — reuse it.
      const namelessAllowed =
        namelessSince === since
          ? inSpecWindow
          : new Set((await readLandings(namelessSince, spec.until)).map((l) => l.hash));
      // Name filtering runs before loadLandingSections applies the cap:
      // selecting out of an already-capped set would let the cap evict the very
      // landing the user asked for. Matched named landings are placed ahead of
      // nameless ones for the same reason — nameless landings always pass this
      // filter (no name to reject them by), so a repository that also takes
      // frequent direct-to-base commits could otherwise fill every cap slot
      // with nameless landings and evict the one landing that was selected.
      const selected = [
        ...judged.filter(
          (l) => l.branch !== null && hit(l.branch) && (!inSpecWindow || inSpecWindow.has(l.hash))
        ),
        ...judged.filter((l) => l.branch === null && (!namelessAllowed || namelessAllowed.has(l.hash))),
      ];
      const { sections: landingSections, rendered } = await loadLandingSections(
        repoPath,
        spec,
        selected
      );
      sections.push(...landingSections);

      // Every named landing this run selected, windowless — the predicate
      // never sees the window, so a name is confirmed whether or not its
      // landing rendered. This is also the exclusion set for paths 2/3: a
      // branch path 1 or a merge-parse already named needs no second,
      // differently-evidenced section, rendered or not.
      //
      // The base is excluded here the same way `names` (above) and `eligible`
      // (loadConfirmedSections) already are: a merge subject can parse to the
      // base's own name (`Merge pull request #5 from someuser/main`, an
      // ordinary shape whenever a contributor's fork also defaults to
      // `main`), and `branches:*` selects the base too — without this,
      // `hit("main")` is true and the base would confirm itself by name,
      // exactly what B12 forbids.
      const namedSelected = judged.filter(
        (l) => l.branch !== null && !namesBase(base, l.branch) && hit(l.branch)
      );
      // Branches already reported in full above need no header-only section.
      const renderedNames = new Set(rendered.flatMap((l) => (l.branch ? [l.branch.toLowerCase()] : [])));
      const seenNames = new Set<string>();
      const nameConfirmedCandidates = namedSelected.filter((l) => {
        if (!l.branch || renderedNames.has(l.branch.toLowerCase())) return false;
        const key = l.branch.toLowerCase();
        if (seenNames.has(key)) return false; // one landing per name; judged is newest-first
        seenNames.add(key);
        return true;
      });
      sections.push(
        ...nameConfirmedCandidates
          .slice(0, MAX_BRANCHES)
          .map((l) => confirmedHeader(base, l.branch ?? "", l.date))
      );
      if (nameConfirmedCandidates.length > MAX_BRANCHES) {
        sections.push(
          `(only the ${MAX_BRANCHES} most recent of ${nameConfirmedCandidates.length} branches confirmed by name were listed)`
        );
      }

      const namedAlready = new Set(
        namedSelected.flatMap((l) => (l.branch ? [l.branch.toLowerCase()] : []))
      );
      sections.push(
        ...(await loadConfirmedSections(
          repoPath,
          spec,
          base,
          selectedBranches,
          judged,
          namedAlready
        ))
      );
    } else {
      since = spec.since ?? DEFAULT_SINCE;
      const { sections: landingSections } = await loadLandingSections(
        repoPath,
        spec,
        await readLandings(since, spec.until)
      );
      sections.push(...landingSections);
      note = "";
    }

    // The header reports the window the *spec* set, so an explicit selection
    // still reads "all history"; the nameless bound is named as its own clause
    // rather than replacing it, since the two apply to different landings.
    const namelessNote =
      hit && !spec.branches && spec.since === null && spec.until === null
        ? `, recent landings ${DEFAULT_SINCE}`
        : "";
    const header = `repository: ${spec.path} (${windowLabel(since, spec.until)}${namelessNote}${note})`;
    parts.push(`${header}\n${sections.join("\n\n") || "(no commits in this window)"}`);
  }
  return parts.join("\n\n");
}
