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
 * Covers the work contract's acceptance criteria A1-A11 and invariants I1-I4
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
      `export { buildPrompt } from ${JSON.stringify(path.join(repoRoot, "src/core/prompt"))};\n`
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
 * the globToRegExp cases below match against.
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
const { parseGitSpec, branchCandidates, loadGitLog, buildPrompt, t } = mod;

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
 * globToRegExp is not exported. Its only observable path is loadGitLog's
 * `branches:<glob>` filter, which throws git.no-branches when zero branches
 * match — upstream of the commit selection this contract replaces, so these
 * assertions do not pin behavior that is the deliverable to remove.
 */
console.log("globToRegExp (via loadGitLog branches: filter)");

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

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
