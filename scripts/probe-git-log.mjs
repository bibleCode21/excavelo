/**
 * Probe for src/core/git-log.ts and src/core/prompt.ts — run with
 * `node scripts/probe-git-log.mjs`.
 *
 * No test runner exists (package.json declares lint and build only), and
 * git-log.ts imports `obsidian` at module top, so it cannot be required from
 * plain node. This script esbuild-bundles the modules with an `obsidian` stub
 * and asserts against the bundle with node:assert. No framework, no new
 * dependency — esbuild is already a devDependency.
 *
 * Covers the work contract's acceptance criteria A1-A16 and invariants I1-I4
 * (docs/specs/git-log-master-source.md). A1-A8 run against buildFixture(),
 * which carries every merge shape the contract names; A9 calls buildPrompt on
 * a hand-built context (prompt.ts imports types only); A11 needs more than
 * MAX_BRANCHES named landings and gets its own fixture.
 *
 * Fixture dates are fixed ISO instants in 2024 and every assertion passes an
 * explicit since:/until: window, so the probe does not drift as the wall clock
 * moves. Author and committer dates are set apart where the contract
 * distinguishes them (the window and a landing header use the committer date;
 * per-commit lines render the author date).
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import esbuild from "esbuild";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "probe-git-log-"));

/**
 * MAX_BRANCHES is not exported, and A11 only tests anything while the probe's
 * idea of the cap matches the module's: hardcode 50 here and a changed cap
 * would leave A11 passing vacuously against a fixture that no longer reaches
 * it. Read it off the source instead — a changed cap moves the fixture with
 * it, and an unreadable one fails loudly rather than silently.
 */
const MAX_BRANCHES = Number(
  /const MAX_BRANCHES = (\d+)/.exec(
    fs.readFileSync(path.join(repoRoot, "src/core/git-log.ts"), "utf8")
  )?.[1]
);
assert.ok(Number.isInteger(MAX_BRANCHES), "could not read MAX_BRANCHES out of git-log.ts");

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.log(`  FAIL ${name}\n       ${String(e.message).split("\n").join("\n       ")}`);
  }
}

/**
 * Bundle git-log.ts with `obsidian` aliased to a stub. `t` is re-exported
 * alongside so error assertions can pin the i18n *key* rather than the
 * English wording — the contract preserves the key, not the text. buildPrompt
 * rides along for A9.
 */
function loadModule() {
  const stub = path.join(tmp, "obsidian-stub.js");
  const entry = path.join(tmp, "entry.ts");
  const out = path.join(tmp, "bundle.cjs");
  fs.writeFileSync(stub, "export const Platform = { isMobile: false };\n");
  fs.writeFileSync(
    entry,
    `export * from ${JSON.stringify(path.join(repoRoot, "src/core/git-log"))};\n` +
      `export { t } from ${JSON.stringify(path.join(repoRoot, "src/i18n"))};\n` +
      `export { buildPrompt } from ${JSON.stringify(path.join(repoRoot, "src/core/prompt"))};\n` +
      `export { STARTER_TEMPLATES } from ${JSON.stringify(path.join(repoRoot, "src/core/starter-templates"))};\n`
  );
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: out,
    alias: { obsidian: stub },
    logLevel: "warning",
  });
  return createRequire(import.meta.url)(out);
}

function makeGit(repo) {
  return (args, env = {}) =>
    execFileSync(
      "git",
      [
        "-C",
        repo,
        "-c",
        "user.name=probe",
        "-c",
        "user.email=probe@example.com",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } }
    );
}

/** Author and committer date; one argument sets both. */
const at = (author, committer = author) => ({
  GIT_AUTHOR_DATE: author,
  GIT_COMMITTER_DATE: committer,
});

/**
 * The contract's fixture: a base commit, a --no-ff-merged branch, a
 * never-merged branch, a squash-merged branch, a rebased-and-fast-forwarded
 * branch, an octopus merge, and a direct commit — plus the three bare branches
 * the globMatch cases below match against.
 *
 * Every branch touches its own files, so no merge here can conflict. Landings
 * are built in committer-date order (2024-07-10 .. 2024-07-14), so the
 * first-parent walk's order and their dates agree, as in a real repository.
 */
function buildFixture() {
  const repo = path.join(tmp, "repo");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  const commit = (file, msg, dates) => {
    fs.writeFileSync(path.join(repo, file), `${msg}\n`);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", msg], dates);
  };

  commit("README", "base", at("2024-01-01T12:00:00Z"));
  const base = git(["rev-parse", "HEAD"]).trim();
  for (const b of ["feature/2026/a/b", "probe/xy", "probe/axb"]) git(["branch", b]);

  // A1 — merged with --no-ff: a named merge landing (cd 2024-07-10) whose
  // commits were authored in June, outside the July window (A6).
  git(["checkout", "-q", "-b", "feature/merged", base]);
  commit("merged-1.txt", "merged: first", at("2024-06-01T12:00:00Z"));
  commit("merged-2.txt", "merged: second", at("2024-06-02T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(
    ["merge", "--no-ff", "-m", "Merge branch 'feature/merged'", "feature/merged"],
    at("2024-07-10T12:00:00Z")
  );

  // A3 — squash-merged. The subject deliberately does not name the branch,
  // which is what GitHub and GitLab write by default.
  git(["checkout", "-q", "-b", "feature/squashed", base]);
  commit("squashed-1.txt", "squashed: alpha", at("2024-06-10T12:00:00Z"));
  commit("squashed-2.txt", "squashed: beta", at("2024-06-11T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(["merge", "--squash", "feature/squashed"]);
  git(["commit", "-q", "-m", "Add the squashed feature (#42)"], at("2024-07-11T12:00:00Z"));

  // A8 — branched off base, so rebasing onto the advanced main really rewrites
  // both commits; GIT_COMMITTER_DATE lands them in the window, author dates
  // survive the rewrite. Then main fast-forwards onto it.
  git(["checkout", "-q", "-b", "feature/rebased", base]);
  commit("rebased-1.txt", "rebased: one", at("2024-06-20T12:00:00Z"));
  commit("rebased-2.txt", "rebased: two", at("2024-06-21T12:00:00Z"));
  git(["rebase", "-q", "main"], { GIT_COMMITTER_DATE: "2024-07-12T12:00:00Z" });
  git(["checkout", "-q", "main"]);
  git(["merge", "-q", "--ff-only", "feature/rebased"]);

  // A7 — octopus. The subject matches none of parseMergeBranchName's formats,
  // so this landing is labelled `merge: <subject>`.
  git(["checkout", "-q", "-b", "feature/oct1", "main"]);
  commit("oct1.txt", "oct1: work", at("2024-06-25T12:00:00Z"));
  git(["checkout", "-q", "-b", "feature/oct2", "main"]);
  commit("oct2.txt", "oct2: work", at("2024-06-26T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(
    [
      "merge",
      "--no-ff",
      "-m",
      "Merge branches 'feature/oct1' and 'feature/oct2'",
      "feature/oct1",
      "feature/oct2",
    ],
    at("2024-07-13T12:00:00Z")
  );

  // A4/A6 — a direct commit whose two dates differ: it lands 2024-07-14
  // (committer, what the window filters on and the header shows) but was
  // authored 2024-06-15 (what the commit line renders).
  commit("direct.txt", "direct work on main", at("2024-06-15T12:00:00Z", "2024-07-14T12:00:00Z"));

  // A2 — never merged, branched off the finished main.
  git(["checkout", "-q", "-b", "feature/never", "main"]);
  commit("never-1.txt", "never: work in progress", at("2024-07-05T12:00:00Z"));
  git(["checkout", "-q", "main"]);

  return repo;
}

/**
 * A11's fixture: more than MAX_BRANCHES named merge landings, oldest first, so
 * feature/n1's landing sits well outside the 50 most recent. Built with
 * commit-tree rather than checkout/merge — same shape, a fraction of the git
 * invocations.
 */
function buildManyLandingsFixture(count) {
  const repo = path.join(tmp, "many");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "many\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));

  const tree = git(["rev-parse", "main^{tree}"]).trim();
  let head = git(["rev-parse", "main"]).trim();
  for (let i = 1; i <= count; i++) {
    const env = at(new Date(Date.UTC(2024, 4, 1, 12) + i * 86_400_000).toISOString());
    const side = git(["commit-tree", tree, "-p", head, "-m", `work on feature/n${i}`], env).trim();
    const merge = git(
      ["commit-tree", tree, "-p", head, "-p", side, "-m", `Merge branch 'feature/n${i}'`],
      env
    ).trim();
    git(["branch", `feature/n${i}`, side]);
    head = merge;
  }
  git(["update-ref", "refs/heads/main", head]);
  git(["reset", "-q", "--hard", "main"]);
  return repo;
}

/**
 * Round 2 fixture: more than MAX_BRANCHES never-merged branches, plus main's
 * own tip bumped to the most recent committer date of all — the shape that
 * catches the `considered` filter regression. Before the fix, `base` was
 * excluded from the not-yet-landed candidates only inside the per-branch loop
 * (after the cap slice), so when a selection also matches the base ref (a
 * bare `*` glob does), the base wastes a slot in `considered.slice(0,
 * MAX_BRANCHES)` ahead of the real branches, evicting one more real branch
 * than the cap alone would. Built with commit-tree, same as
 * buildManyLandingsFixture — none of these branches are merged.
 */
function buildManyUnlandedBranchesFixture(count) {
  const repo = path.join(tmp, "manyUnlanded");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));
  const base = git(["rev-parse", "main"]).trim();
  const tree = git(["rev-parse", "main^{tree}"]).trim();

  for (let i = 1; i <= count; i++) {
    const env = at(new Date(Date.UTC(2024, 0, 1, 12) + i * 86_400_000).toISOString());
    const tip = git(["commit-tree", tree, "-p", base, "-m", `work on feature/u${i}`], env).trim();
    git(["branch", `feature/u${i}`, tip]);
  }

  // main's tip lands after every branch's commit, so main out-ranks all of
  // them by committer date — the worst case for the regression.
  const mainEnv = at(new Date(Date.UTC(2024, 0, 1, 12) + (count + 1) * 86_400_000).toISOString());
  fs.writeFileSync(path.join(repo, "later.txt"), "later\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "later main work"], mainEnv);

  return repo;
}

/**
 * A16's fixture: one named merge landing, old, followed by more
 * than MAX_BRANCHES nameless direct commits (newer). Pasting the merge's
 * branch name sets since to null (the window rule), so `enumerateLandings`
 * returns every nameless commit too — nameless landings are never filtered
 * out by name (§Selection). Before the fix, `loadLandingSections` sliced
 * newest-first without prioritizing the matched landing, so the nameless
 * commits — all newer — filled every cap slot and evicted the one landing
 * the user actually selected.
 */
function buildSelectedLandingCrowdedByNamelessFixture(directCount) {
  const repo = path.join(tmp, "crowded");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  fs.writeFileSync(path.join(repo, "README"), "crowded\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"], at("2024-01-01T12:00:00Z"));

  const tree = git(["rev-parse", "main^{tree}"]).trim();
  const base = git(["rev-parse", "main"]).trim();
  const sideEnv = at("2024-01-05T12:00:00Z");
  const side = git(["commit-tree", tree, "-p", base, "-m", "work on feature/selected"], sideEnv).trim();
  const merge = git(
    ["commit-tree", tree, "-p", base, "-p", side, "-m", "Merge branch 'feature/selected'"],
    sideEnv
  ).trim();
  git(["branch", "feature/selected", side]);
  git(["update-ref", "refs/heads/main", merge]);
  git(["reset", "-q", "--hard", "main"]);

  // Every direct commit lands after the merge, so a naive newest-first cap
  // fills entirely with these before the merge landing gets a slot.
  for (let i = 1; i <= directCount; i++) {
    const env = at(new Date(Date.UTC(2024, 1, 1, 12) + i * 86_400_000).toISOString());
    fs.writeFileSync(path.join(repo, `d${i}.txt`), `${i}\n`);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", `direct work ${i}`], env);
  }
  return repo;
}

/**
 * A12's fixture: one landing old enough that only an unbounded walk reaches it,
 * and one recent enough that the 7-day default does.
 *
 * The recent commit is dated relative to now — the one place in this probe
 * where that is right rather than drift. Every other fixture is fixed in 2024
 * and every other assertion passes an explicit window, which is precisely what
 * kept the default-window path unexercised and hid the bug A12 exists for. A12
 * is *about* the default window, so its fixture has to straddle that window's
 * live boundary. Nothing below asserts an absolute date: the criterion is an
 * equality between two runs taken at the same instant, which holds whatever the
 * clock says.
 */
function buildDefaultWindowFixture() {
  const repo = path.join(tmp, "window");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  const commit = (file, msg, dates) => {
    fs.writeFileSync(path.join(repo, file), `${msg}\n`);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", msg], dates);
  };

  commit("README", "base", at("2024-01-01T12:00:00Z"));
  const base = git(["rev-parse", "HEAD"]).trim();

  // A13's sharp case: merged, then the source branch deleted — the ordinary
  // GitHub flow. The name now survives only on the landing, so the match test
  // has to see a landing older than the default window or it will not see it
  // at all. This is where reading narrow first is wrong, not merely slower.
  git(["checkout", "-q", "-b", "feature/deleted", base]);
  commit("deleted.txt", "deleted: work", at("2024-06-05T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(
    ["merge", "--no-ff", "-m", "Merge branch 'feature/deleted'", "feature/deleted"],
    at("2024-07-09T12:00:00Z")
  );
  git(["branch", "-D", "feature/deleted"]);

  // Reachable only by an unbounded walk — the bug's tell. Branch still exists.
  git(["checkout", "-q", "-b", "feature/old", base]);
  commit("old.txt", "old: work", at("2024-06-01T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(
    ["merge", "--no-ff", "-m", "Merge branch 'feature/old'", "feature/old"],
    at("2024-07-10T12:00:00Z")
  );

  // Inside the 7-day default, so the window is provably live, not just empty.
  commit("recent.txt", "recent work", at(new Date(Date.now() - 2 * 86_400_000).toISOString()));
  return repo;
}

/**
 * A14's fixture: a merge subject carrying a 100k-character branch name, which
 * `parseMergeBranchName` lifts onto the landing and the user's `branches:` glob
 * is then tested against. That is the real path the security finding named — a
 * third party's commit subject reaching the user's glob — and it is reached
 * through loadGitLog, exactly as A10's globs are. globMatch stays unexported.
 *
 * `feature/hotfix` exists so the glob matches a ref: that makes the
 * git.no-branches guard short-circuit, and the long name then meets the regex
 * at the name-filtering step rather than inside a throw.
 */
const HUGE_NAME_LENGTH = 100_000;

function buildLongSubjectFixture() {
  const repo = path.join(tmp, "redos");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = makeGit(repo);
  const commit = (file, msg, dates) => {
    fs.writeFileSync(path.join(repo, file), `${msg}\n`);
    git(["add", "-A"]);
    git(["commit", "-q", "-m", msg], dates);
  };

  commit("README", "base", at("2024-01-01T12:00:00Z"));
  const base = git(["rev-parse", "HEAD"]).trim();
  git(["branch", "feature/hotfix"]);

  git(["checkout", "-q", "-b", "feature/huge", base]);
  commit("huge.txt", "huge: work", at("2024-06-01T12:00:00Z"));
  git(["checkout", "-q", "main"]);
  git(
    ["merge", "--no-ff", "-m", `Merge branch '${"a".repeat(HUGE_NAME_LENGTH)}'`, "feature/huge"],
    at("2024-07-10T12:00:00Z")
  );
  return repo;
}

/**
 * loadGitLog returns one freeform string (I4). Section bodies carry blank
 * lines of their own (the pretty format opens with %n, --stat adds more), so
 * sections are cut on their header lines, never on blank lines.
 */
function sections(out) {
  const found = [];
  let cur = null;
  for (const line of out.split("\n")) {
    if (line.startsWith("--- landed ") || line.startsWith("--- not yet on ")) {
      cur = { header: line, body: [] };
      found.push(cur);
    } else if (cur) {
      cur.body.push(line);
    }
  }
  return found.map((s) => ({ header: s.header, body: s.body.join("\n") }));
}

const landedSections = (out) => sections(out).filter((s) => s.header.startsWith("--- landed "));
const section = (out, header) => sections(out).find((s) => s.header === header);
/** Subject lines are rendered alone on a line; anchor so `n1` never hits `n10`. */
const hasSubject = (text, subject) =>
  new RegExp(`^${subject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m").test(text);
const countOf = (text, needle) => text.split(needle).length - 1;

const mod = loadModule();
const { parseGitSpec, branchCandidates, loadGitLog, buildPrompt, STARTER_TEMPLATES, t } = mod;

console.log("parseGitSpec");

check("A10 — path with spaces + since:7d + until:today + branches:", () => {
  assert.deepEqual(
    parseGitSpec("D:/my git/excavelo repo since:7d until:today branches:feature/2026/*"),
    { path: "D:/my git/excavelo repo", since: "7 days ago", until: "midnight", branches: "feature/2026/*" }
  );
});

check("ISO dates pass through unchanged", () => {
  assert.deepEqual(parseGitSpec("/r since:2026-07-01 until:2026-07-05"), {
    path: "/r",
    since: "2026-07-01",
    until: "2026-07-05",
    branches: null,
  });
});

check("branch: is an alias for branches:", () => {
  assert.equal(parseGitSpec("/r branch:feature/x").branches, "feature/x");
});

check("bare path — no tokens, all null", () => {
  assert.deepEqual(parseGitSpec("  /r/some path  "), {
    path: "/r/some path",
    since: null,
    until: null,
    branches: null,
  });
});

console.log("branchCandidates");

check("a slash is required", () => {
  assert.deepEqual(branchCandidates("noslash feature/x"), ["feature/x"]);
});

check("git-ref charset only — tildes and URLs rejected", () => {
  assert.deepEqual(branchCandidates("feat~ure/x https://example.com/a"), []);
});

check("surrounding brackets, quotes and punctuation stripped", () => {
  assert.deepEqual(branchCandidates("(feature/a) 'feature/b', *feature/c*"), [
    "feature/a",
    "feature/b",
    "feature/c",
  ]);
});

check("//, leading and trailing slashes rejected", () => {
  assert.deepEqual(branchCandidates("a//b /lead trail/"), []);
});

check("duplicates collapsed", () => {
  assert.deepEqual(branchCandidates("feature/x feature/x"), ["feature/x"]);
});

/**
 * globMatch is not exported. Its only observable path is loadGitLog's
 * `branches:<glob>` filter, which throws git.no-branches when zero branches
 * match — upstream of the commit selection this contract replaces, so these
 * assertions do not pin behavior that is the deliverable to remove.
 */
console.log("globMatch (via loadGitLog branches: filter)");

const repo = buildFixture();
// Bare branches present for these cases: feature/2026/a/b, probe/xy, probe/axb.
const matches = async (glob) => {
  try {
    await loadGitLog([`${repo} branches:${glob}`]);
    return true;
  } catch (e) {
    if (e.message === t("git.no-branches", { glob, path: repo })) return false;
    throw e;
  }
};

const globCases = [
  ["feature/2026/* — * crosses slashes", "feature/2026/*", true],
  ["probe/x? — ? matches one character", "probe/x?", true],
  ["probe/xy? — ? is not zero characters", "probe/xy?", false],
  ["probe/? — ? is not many characters", "probe/?", false],
  ["probe/a.b — regex metacharacters escaped", "probe/a.b", false],
  ["PROBE/XY — case-insensitive", "PROBE/XY", true],
];

for (const [name, glob, expected] of globCases) {
  let actual;
  try {
    actual = await matches(glob);
  } catch (e) {
    failures.push({ name, e });
    console.log(`  FAIL ${name}\n       ${e.message}`);
    continue;
  }
  check(name, () => assert.equal(actual, expected, `glob ${glob}: expected match=${expected}`));
}

/**
 * The landing traversal. WINDOW spans every landing's committer date
 * (2024-07-10 .. 2024-07-14) and no author date; JUNE spans the June author
 * dates and no committer date. Both are explicit, so nothing below depends on
 * today's date or on DEFAULT_SINCE.
 */
console.log("landing traversal (A1-A8)");

const WINDOW = "since:2024-07-01 until:2024-07-31";
const JUNE = "since:2024-06-01 until:2024-07-01";
const log = (memo = "", window = WINDOW) => loadGitLog([`${repo} ${window}`], memo);

const noSelection = await log();
const pastedMerged = await log("shipped feature/merged this week");
const pastedNever = await log("still on feature/never");
const pastedSquashed = await log("wrapped up feature/squashed");
const pastedRebased = await log("landed feature/rebased");
const juneWindow = await log("", JUNE);

const MERGED_HEADER = "--- landed 2024-07-10 branch: feature/merged";

check("A1 — merged branch's commits under a named landing, no selection", () => {
  const s = section(noSelection, MERGED_HEADER);
  assert.ok(s, `expected a section headed "${MERGED_HEADER}"`);
  assert.ok(hasSubject(s.body, "merged: first"), "merged: first missing from the landing");
  assert.ok(hasSubject(s.body, "merged: second"), "merged: second missing from the landing");
});

check("A1 — same landing when the branch name is pasted", () => {
  const s = section(pastedMerged, MERGED_HEADER);
  assert.ok(s, `expected a section headed "${MERGED_HEADER}"`);
  assert.ok(hasSubject(s.body, "merged: first"), "merged: first missing from the landing");
  assert.ok(hasSubject(s.body, "merged: second"), "merged: second missing from the landing");
});

check("A2 — never-merged branch is absent entirely with no selection", () => {
  assert.ok(
    !hasSubject(noSelection, "never: work in progress"),
    "an unlanded commit leaked into an unselected log"
  );
});

check("A2 — pasted, it appears only under not-yet-landed", () => {
  const s = section(pastedNever, "--- not yet on main branch: feature/never");
  assert.ok(s, "expected a not-yet-landed section for feature/never");
  assert.ok(hasSubject(s.body, "never: work in progress"), "the branch's commit is missing");
  for (const l of landedSections(pastedNever)) {
    assert.ok(
      !hasSubject(l.body, "never: work in progress"),
      `unlanded work reported as shipped under "${l.header}"`
    );
  }
});

check("A3 — squash landing is `direct`, no selection", () => {
  const s = section(noSelection, "--- landed 2024-07-11 direct");
  assert.ok(s, "expected a direct landing for the squash commit");
  assert.ok(hasSubject(s.body, "Add the squashed feature (#42)"), "the squash commit is missing");
});

check("A3 — squash landing survives its own branch name being pasted", () => {
  const s = section(pastedSquashed, "--- landed 2024-07-11 direct");
  assert.ok(s, "a nameless landing was dropped by name filtering");
  assert.ok(hasSubject(s.body, "Add the squashed feature (#42)"), "the squash commit is missing");
});

check("A4 — direct commit lands, no selection", () => {
  const s = section(noSelection, "--- landed 2024-07-14 direct");
  assert.ok(s, "expected a direct landing");
  assert.ok(hasSubject(s.body, "direct work on main"), "the direct commit is missing");
});

check("A4 — direct commit lands under a selection no name of it can match", () => {
  const s = section(pastedMerged, "--- landed 2024-07-14 direct");
  assert.ok(s, "a nameless landing was dropped by name filtering");
  assert.ok(hasSubject(s.body, "direct work on main"), "the direct commit is missing");
});

const git = makeGit(repo);
let checkedOutElsewhere;
try {
  git(["checkout", "-q", "feature/never"]);
  checkedOutElsewhere = await log();
} finally {
  git(["checkout", "-q", "main"]);
}

check("A5 — output is byte-identical whichever branch is checked out", () => {
  assert.equal(checkedOutElsewhere, noSelection);
});

check("A6 — a window excluding a landing's committer date drops it and its commits", () => {
  assert.ok(
    !hasSubject(juneWindow, "direct work on main"),
    "a landing whose committer date is outside the window was emitted"
  );
  assert.ok(!hasSubject(juneWindow, "merged: first"), "an excluded landing's commits leaked in");
  assert.equal(landedSections(juneWindow).length, 0);
});

check("A6 — an included landing renders every commit, author date regardless", () => {
  const s = section(noSelection, MERGED_HEADER);
  assert.ok(s, `expected a section headed "${MERGED_HEADER}"`);
  // Authored 2024-06-01, outside the July window, but landed inside it: the
  // per-commit line keeps the author date (%ad).
  assert.match(s.body, /^=== \w+ 2024-06-01 probe$/m);
  assert.match(s.body, /^=== \w+ 2024-06-02 probe$/m);
});

check("A6 — header shows the committer date, the commit line the author date", () => {
  const s = section(noSelection, "--- landed 2024-07-14 direct");
  assert.ok(s, "expected a direct landing");
  assert.match(s.body, /^=== \w+ 2024-06-15 probe$/m);
});

check("A7 — an octopus merge's third-parent commits land", () => {
  const s = sections(noSelection).find((x) => x.header.startsWith("--- landed 2024-07-13 merge:"));
  assert.ok(s, "expected a merge landing for the octopus");
  assert.ok(hasSubject(s.body, "oct1: work"), "second parent's commit missing");
  assert.ok(hasSubject(s.body, "oct2: work"), "third parent's commit missing");
});

check("A8 — a rebased-and-fast-forwarded branch lands as `direct` commits", () => {
  const s = section(pastedRebased, "--- landed 2024-07-12 direct");
  assert.ok(s, "expected direct landings for the rebased commits");
  const both = landedSections(pastedRebased)
    .map((x) => x.body)
    .join("\n");
  assert.ok(hasSubject(both, "rebased: one"), "rebased: one missing");
  assert.ok(hasSubject(both, "rebased: two"), "rebased: two missing");
});

check("A8 — and is reported exactly once, with no not-yet-landed section", () => {
  assert.equal(
    sections(pastedRebased).filter((s) => s.header.includes("feature/rebased")).length,
    0,
    "a landed branch was also reported as unlanded"
  );
  assert.equal(countOf(pastedRebased, "rebased: one"), 1);
  assert.equal(countOf(pastedRebased, "rebased: two"), 1);
});

/**
 * I1-I3. The contract's Verification section puts these on this probe next to
 * A1-A10; they cost one merge-base call per rendered commit against the
 * fixture already built above. I4 rides along with A9 below.
 */
console.log("invariants (I1-I3)");

const hashesIn = (text) => [...text.matchAll(/^=== (\w+) /gm)].map((m) => m[1]);
const isAncestorOfBase = (hash) => {
  try {
    git(["merge-base", "--is-ancestor", hash, "main"]);
    return true;
  } catch {
    return false;
  }
};

check("I1 — every commit under a landed section is reachable from the base", () => {
  const rendered = landedSections(noSelection).flatMap((s) => hashesIn(s.body));
  assert.ok(rendered.length > 0, "no commits rendered — the invariant would hold vacuously");
  for (const h of rendered) {
    assert.ok(isAncestorOfBase(h), `${h} is rendered as landed but is not an ancestor of main`);
  }
});

check("I2 — every commit under a not-yet-landed section is not reachable from the base", () => {
  const unlanded = sections(pastedNever)
    .filter((s) => s.header.startsWith("--- not yet on "))
    .flatMap((s) => hashesIn(s.body));
  assert.ok(unlanded.length > 0, "no unlanded commits rendered — nothing to check");
  for (const h of unlanded) {
    assert.ok(!isAncestorOfBase(h), `${h} is rendered as unlanded but already reached main`);
  }
});

check("I3 — no commit appears under two landed sections", () => {
  const rendered = landedSections(noSelection).flatMap((s) => hashesIn(s.body));
  const seen = new Set();
  for (const h of rendered) {
    assert.ok(!seen.has(h), `${h} is rendered under two landed sections`);
    seen.add(h);
  }
});

console.log("prompt rules (A9)");

const template = { name: "work-log", description: "", instruction: "Write the work log.", filePath: "t.md" };
const ctxWith = (gitLog) => ({
  defaultContext: "",
  perNoteContext: null,
  rawBody: "memo body",
  transcript: null,
  gitLog,
  template,
  vaultRoot: "/vault",
});

const LANDED_WINS =
  "A landed section is the shipped record and wins: when the same work appears in both a landed and a not-yet-landed section, report it as shipped and never also as in progress.";

const withGit = buildPrompt(ctxWith("--- landed 2024-07-14 direct\n=== abc1234 2024-06-15 probe\nwork"));
const withoutGit = buildPrompt(ctxWith(null));

check("A9 — the landed-wins rule is emitted in === OUTPUT RULES ===", () => {
  const rules = withGit.user.slice(withGit.user.indexOf("=== OUTPUT RULES ==="));
  assert.ok(rules.includes(LANDED_WINS), "the landed-wins rule is missing or reworded");
});

check("A9/I4 — exactly one === GIT LOG === block", () => {
  assert.equal(countOf(withGit.user, "=== GIT LOG ==="), 1);
});

check("A9 — no gitLog: no GIT LOG block and no git rules", () => {
  assert.equal(countOf(withoutGit.user, "=== GIT LOG ==="), 0);
  assert.ok(!withoutGit.user.includes(LANDED_WINS));
});

console.log("filter before cap (A11)");

const many = buildManyLandingsFixture(MAX_BRANCHES + 5);
const manyGit = makeGit(many);
const firstParents = manyGit([
  "log",
  "--first-parent",
  "main",
  "--pretty=%s",
]).trim().split("\n");
const n1Index = firstParents.indexOf("Merge branch 'feature/n1'");
const manyOut = await loadGitLog([`${many} since:2024-04-01 until:2024-07-01`], "picked up feature/n1");

check("A11 — the fixture's premise: n1's landing is older than the 50 most recent", () => {
  assert.ok(
    n1Index >= MAX_BRANCHES,
    `n1's landing is at index ${n1Index}; it must sit past the cap for this to test anything`
  );
});

check("A11 — a pasted branch's landing survives even when the cap would evict it", () => {
  const s = section(manyOut, "--- landed 2024-05-02 branch: feature/n1");
  assert.ok(s, "the selected branch's landing was evicted — the cap ran before name filtering");
  assert.ok(hasSubject(s.body, "work on feature/n1"), "the landing's commit is missing");
});

check("A11 — and the unselected landings are filtered out", () => {
  assert.equal(landedSections(manyOut).length, 1);
  assert.ok(!manyOut.includes("feature/n55"), "an unselected landing was emitted");
});

/**
 * Round 2 regression: `loadNotLandedSections` must exclude the base ref from
 * `considered` *before* slicing to MAX_BRANCHES, not after (git-log.ts:432).
 * A `branches:*` glob selects every branch, main included, so main competes
 * for a cap slot unless it is filtered out up front. This does not follow
 * from any of A1-A15 — none of them puts more than MAX_BRANCHES branches in
 * play on the not-yet-landed side — so it had no coverage before this probe.
 */
console.log("not-yet-landed cap excludes the base ref before slicing (Round 2 fix)");

const manyUnlanded = buildManyUnlandedBranchesFixture(MAX_BRANCHES + 1);
const unlandedOut = await loadGitLog([`${manyUnlanded} since:2024-01-01 branches:*`]);

check("base ref never gets its own not-yet-landed section", () => {
  assert.ok(
    !unlandedOut.includes("--- not yet on main branch: main"),
    "the base ref was reported as its own unlanded branch"
  );
});

check("the over-cap notice counts real unlanded branches, not the base ref", () => {
  assert.ok(
    unlandedOut.includes(`of ${MAX_BRANCHES + 1} unlanded branches were scanned`),
    `expected the notice to count ${MAX_BRANCHES + 1} real branches; got: ${unlandedOut.slice(unlandedOut.indexOf("(only"))}`
  );
});

check("base ref does not waste a cap slot ahead of a real branch", () => {
  // 51 real branches over a cap of 50 evicts exactly one (the oldest,
  // feature/u1) when base is excluded first. If base instead occupies a
  // slot, feature/u2 is evicted too — that second eviction is the bug.
  assert.ok(
    hasSubject(unlandedOut, "work on feature/u2"),
    "feature/u2 was evicted — the base ref must be excluded before the cap slice, not after"
  );
});

/**
 * A16. A pasted-name match must not be evictable by nameless landings that
 * merely happen to be more recent (git-log.ts's `selected` computation in
 * loadGitLog). None of A1-A15 mixes a matched named landing with more-recent
 * nameless landings in the same fixture, so this had no coverage before this
 * probe.
 */
console.log("a selected landing survives nameless landings crowding the cap (A16)");

const crowded = buildSelectedLandingCrowdedByNamelessFixture(MAX_BRANCHES + 10);
const crowdedOut = await loadGitLog([`${crowded} since:2024-01-01`], "picked up feature/selected");

check("A16 — the selected merge landing is not evicted by newer nameless landings", () => {
  const s = section(crowdedOut, "--- landed 2024-01-05 branch: feature/selected");
  assert.ok(s, "feature/selected's landing was evicted — nameless landings filled the cap first");
  assert.ok(hasSubject(s.body, "work on feature/selected"), "the landing's commit is missing");
});

/**
 * A12. `branchCandidates` takes any slash-bearing token, so a memo mentioning a
 * file path or a date is the ordinary case: it must leave the repository in the
 * no-selection case *entirely*, window included. Asserted as an equality
 * against the same repository read with a memo carrying no slash-token at all —
 * no absolute date, so no clock drift.
 */
console.log("default window survives a fall-through (A12)");

const win = buildDefaultWindowFixture();
const noToken = await loadGitLog([win], "no slash tokens here at all");
const filePathToken = await loadGitLog([win], "see src/core/git-log.ts for details");
const dateToken = await loadGitLog([win], "standup 2026/07/15 notes");

check("A12 — a non-matching file-path token leaves the default window intact", () => {
  assert.equal(filePathToken, noToken);
});

check("A12 — a non-matching date token likewise", () => {
  assert.equal(dateToken, noToken);
});

check("A12 — the reported window is the 7-day default, not all history", () => {
  assert.ok(
    filePathToken.includes("(since 7 days ago)"),
    `expected the 7-day default; header reads: ${filePathToken.split("\n")[0]}`
  );
  assert.ok(!filePathToken.includes("all history"), "the repository walked its entire history");
});

check("A12 — and that window is live: the recent landing is in, the old one out", () => {
  assert.ok(hasSubject(filePathToken, "recent work"), "the recent landing is missing");
  assert.ok(!hasSubject(filePathToken, "old: work"), "a landing outside the 7-day default was walked");
});

/**
 * A13 — the match half of the window rule. A repository where a pasted name
 * matches takes the explicit-selection window (none, = all history), not the
 * 7-day default. The landings below are dated 2024 and so are older than the
 * default window forever, which is what makes this clock-stable.
 */
const pastedOld = await loadGitLog([win], "finished feature/old");
const pastedDeleted = await loadGitLog([win], "finished feature/deleted");

check("A13 — a matched pasted name reports its landing however old", () => {
  assert.ok(
    section(pastedOld, "--- landed 2024-07-10 branch: feature/old"),
    "a landing older than the 7-day default was missed — the landings were read narrow"
  );
  assert.ok(pastedOld.includes("(all history"), `expected no default window; got: ${pastedOld.split("\n")[0]}`);
});

check("A13 — the name matches only a landing: source branch deleted after merge", () => {
  assert.ok(
    section(pastedDeleted, "--- landed 2024-07-09 branch: feature/deleted"),
    "a deleted branch's landing was invisible — the match was tested against a narrow window"
  );
  assert.ok(hasSubject(pastedDeleted, "deleted: work"), "the landing's commits are missing");
});

/** The window a repository ends up with comes from its own selection outcome. */
const repoPart = (out, p) => {
  const start = out.indexOf(`repository: ${p} (`);
  assert.ok(start >= 0, `no output section for ${p}`);
  const next = out.indexOf("\nrepository: ", start + 1);
  return next < 0 ? out.slice(start) : out.slice(start, next);
};

// feature/merged selects in the main fixture and matches nothing in `win`,
// which must therefore fall through to the default on its own account.
const twoRepos = await loadGitLog([`${repo} ${WINDOW}`, win], "shipped feature/merged");

check("A12 — one repository's match does not drop another's default window", () => {
  assert.equal(repoPart(twoRepos, win), repoPart(noToken, win));
});

check("A12 — while the repository that does match still selects", () => {
  const mine = repoPart(twoRepos, repo);
  assert.ok(mine.includes(", branches named in the memo"), "the matching repository stopped selecting");
  assert.ok(section(mine, MERGED_HEADER), "the selected landing is missing");
});

/**
 * A14. The glob matcher must never backtrack, against any glob shape.
 *
 * `globMatch` is a two-pointer matcher (no regex, no recursion), so no shape —
 * one star, an adjacent run, or several stars separated by literals — can
 * blow up. This directly reproduces the security finding: a Round 2 fix that
 * only collapsed *adjacent* star runs (`/\*+/g` -> one `.*`) left literal-
 * separated stars still compiling to chained `.*.*` segments, which
 * backtracks exponentially — reproduced at 7531ms for `**​/hotfix` and again,
 * independently, at ~11.8s for an 8-star glob with no `**` at all, both
 * against the same 100k-char merge subject. Replacing the regex entirely
 * closes both shapes at once, so this checks both.
 *
 * The glob carries a trailing literal that the subject cannot satisfy on
 * purpose: a pattern that matches immediately (e.g. bare `**`) or fails at a
 * prefix exercises no backtracking either way and would pass vacuously
 * against the very bug this criterion exists to catch (a real trap that
 * caught both this contract's author and its reviewer — see the spec).
 *
 * The threshold is the contract's "well under a second". The margin either
 * side is wide (see the reported timing), so this discriminates rather than
 * races.
 */
console.log("glob matcher never backtracks (A14)");

const redos = buildLongSubjectFixture();
const t0 = performance.now();
const redosOut = await loadGitLog([`${redos} since:2024-01-01 branches:**/hotfix`]);
const elapsed = performance.now() - t0;
console.log(`       (loadGitLog over a ${HUGE_NAME_LENGTH.toLocaleString()}-char merge subject, adjacent-star glob: ${elapsed.toFixed(0)}ms)`);

check("A14 — an adjacent star run over a 100k merge subject returns well under a second", () => {
  assert.ok(elapsed < 1000, `took ${elapsed.toFixed(0)}ms`);
});

check("A14 — and the glob still selects correctly", () => {
  // The 100k name does not end in /hotfix, so its landing is filtered out; the
  // nameless base landing is not filtered by a name it does not have.
  assert.ok(!redosOut.includes("aaaaaaaaaa"), "the non-matching long-named landing was emitted");
  assert.ok(redosOut.includes("branches **/hotfix"), `unexpected header: ${redosOut.split("\n")[0]}`);
});

// The security finding's own shape: several single stars separated by
// literals, no `**` anywhere — the case the star-run-collapse fix left open.
const t1 = performance.now();
let separatedStarsOut;
try {
  separatedStarsOut = await loadGitLog([`${redos} since:2024-01-01 branches:${"a*".repeat(8)}zzz`]);
} catch (e) {
  separatedStarsOut = e.message; // git.no-branches is an acceptable outcome; the timing is what matters
}
const elapsedSeparated = performance.now() - t1;
console.log(`       (loadGitLog over the same subject, 8 literal-separated stars: ${elapsedSeparated.toFixed(0)}ms)`);

check("A14 — literal-separated stars over a 100k merge subject returns well under a second", () => {
  assert.ok(elapsedSeparated < 1000, `took ${elapsedSeparated.toFixed(0)}ms`);
});

/**
 * A15 — the shipped LLM instructions say what SC6's second half claims.
 * Asserted against the generated module (the prebuild hook's output, never
 * hand-edited) on A9's precedent, and flattened first so a reflow of the
 * markdown cannot break a rule that is still there. Nothing else checks these:
 * a reworded-away instruction is a silent behavior change.
 */
console.log("templates (A15)");

const flat = (s) => s.replace(/\s+/g, " ");
const templateBody = (filename) => {
  const found = STARTER_TEMPLATES.find((x) => x.filename === filename);
  assert.ok(found, `${filename} is missing from STARTER_TEMPLATES`);
  return flat(found.content);
};
const workLog = templateBody("work-log.md");
const workReport = templateBody("work-report.md");

check("A15 — work-log no longer dates blocks by the commit date", () => {
  assert.ok(!workLog.includes("Date = commit date"), "the old commit-date instruction is still shipped");
});

check("A15 — work-log keys date blocks to the landing header's date", () => {
  assert.ok(
    workLog.includes("Date = the date on the `--- landed <date>` header the work sits under"),
    "the landing-date rule is missing or reworded"
  );
});

check("A15 — work-log states a not-yet-landed section is never its content", () => {
  assert.ok(
    workLog.includes("Never write a not-yet-landed section into the work log"),
    "the not-yet-landed exclusion is missing or reworded"
  );
});

check("A15 — work-report feeds not-yet-landed sections to In progress / carried over", () => {
  const heading = "## In progress / carried over";
  const idx = workReport.indexOf(heading);
  assert.ok(idx >= 0, "the In progress / carried over section is gone");
  assert.ok(
    workReport.slice(idx).includes("Work that has not landed: the GIT LOG's `--- not yet on <base>` sections"),
    "not-yet-landed sections no longer feed In progress / carried over"
  );
});

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
