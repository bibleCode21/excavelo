/**
 * The spec parser, branch selection, and the landing traversal itself:
 * parseGitSpec, branchCandidates, expandHome, the glob filter, display-vs-ref
 * divergence, A1-A8 and I1-I3.
 *
 * This module builds the main fixture (`repo`) that later modules keep
 * asserting against, so it exports it together with the handles derived from
 * it — `git`, `noSelection`, `WINDOW`, `MERGED_HEADER`, `hashesIn`.
 */

import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import { buildFixture, buildRemoteTrackingFixture } from "./fixtures.mjs";
import { branchCandidates, check, countOf, expandHome, failures, hasSubject, landedSections, loadGitLog, makeGit, parseGitSpec, section, sections, t, tryLoad } from "./harness.mjs";

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
/**
 * expandHome (deferred-followups item 6). `~` and `~/...` are the only forms
 * this project resolves (the current user's home); `~user` is a different
 * user's home and this codebase has no way to look that up. Before the fix,
 * the guard only checked for a leading `~` and blindly concatenated
 * `homedir() + p.slice(1)` — for `~evil` that glues "evil" straight onto the
 * end of the home directory with no separator, silently producing a bogus
 * sibling-ish path instead of leaving the unsupported syntax alone.
 */
console.log("expandHome");

check("no ~ prefix passes through unchanged", () => {
  assert.equal(expandHome("/abs/path"), "/abs/path");
});

check("~ alone expands to the home directory", () => {
  assert.equal(expandHome("~"), os.homedir());
});

check("~/... expands relative to the home directory", () => {
  assert.equal(expandHome("~/work"), `${os.homedir()}/work`);
});

check("~user (unsupported) is left untouched, not mangled onto homedir()", () => {
  assert.equal(expandHome("~evil"), "~evil");
});

check("~user/sub (unsupported) is likewise left untouched", () => {
  assert.equal(expandHome("~evil/sub"), "~evil/sub");
});

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
 * selectBranches (git-log.ts:317-324, `branches.filter((b) => test(b.display)
 * || test(b.ref))`) is shared by both loadGitLog call sites. Every branch
 * used above and below is local-only, where display === ref, so none of that
 * coverage can distinguish a correct `test(b.display) || test(b.ref)` from a
 * regression that drops one side of the `||` or tests the wrong field for
 * either call site — both would keep every other check green. A
 * remote-tracking-only branch (display "feature/remote-only", ref
 * "origin/feature/remote-only") is the one shape that splits the two fields;
 * whether it is selected shows up as a "confirmed landed on main branch: ..."
 * section, since selectedBranches feeds loadConfirmedSections directly. The
 * header is the *display* form whichever field matched — that is the rendered
 * name rule, and it is what makes one constant serve all four checks.
 */
console.log("selectBranches: display vs ref divergence (remote-tracking branch)");

const remoteRepo = buildRemoteTrackingFixture();
const CONFIRMED_HEADER = "--- confirmed landed on main branch: feature/remote-only";
const remoteGlobRefOnly = await tryLoad([`${remoteRepo} since:2024-01-01T00:00:00Z branches:origin/feature/*`]);
const remoteGlobDisplayOnly = await tryLoad([`${remoteRepo} since:2024-01-01T00:00:00Z branches:feature/remote-only`]);
const remotePastedRefOnly = await tryLoad(
  [`${remoteRepo} since:2024-01-01T00:00:00Z`],
  "picked up origin/feature/remote-only"
);
const remotePastedDisplayOnly = await tryLoad([`${remoteRepo} since:2024-01-01T00:00:00Z`], "picked up feature/remote-only");

check("glob mode: a glob matching only the ref (origin/feature/*) still selects", () => {
  assert.ok(
    remoteGlobRefOnly.includes(CONFIRMED_HEADER),
    `selectBranches's "|| test(b.ref)" side is not being exercised; got: ${remoteGlobRefOnly}`
  );
});

check("glob mode: a glob matching only the display name (no origin/ prefix) still selects", () => {
  assert.ok(
    remoteGlobDisplayOnly.includes(CONFIRMED_HEADER),
    `selectBranches's "test(b.display)" side is not being exercised; got: ${remoteGlobDisplayOnly}`
  );
});

check("pasted-candidates mode: a pasted ref-form name (origin/feature/remote-only) still selects", () => {
  assert.ok(
    remotePastedRefOnly.includes(CONFIRMED_HEADER),
    `selectBranches's "|| test(b.ref)" side is not being exercised; got: ${remotePastedRefOnly}`
  );
});

check("pasted-candidates mode: a pasted display-form name (feature/remote-only) still selects", () => {
  assert.ok(
    remotePastedDisplayOnly.includes(CONFIRMED_HEADER),
    `selectBranches's "test(b.display)" side is not being exercised; got: ${remotePastedDisplayOnly}`
  );
});

/**
 * The landing traversal. WINDOW spans every landing's committer date
 * (2024-07-10 .. 2024-07-14) and no author date; JUNE spans the June author
 * dates and no committer date. Both are explicit, so nothing below depends on
 * today's date or on DEFAULT_SINCE.
 */
console.log("landing traversal (A1-A8)");

const WINDOW = "since:2024-07-01 until:2024-07-31";
const JUNE = "since:2024-06-01T00:00:00Z until:2024-07-01";
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

/**
 * A2's second half is narrowed by git-log-landed-confirmation: an unlanded
 * branch no longer gets a `--- not yet on` section, it gets nothing at all
 * (user decision A — only confirmed landings are reported). What must still
 * hold, and is the part A2 exists for, is that its work is never reported as
 * shipped. B6/J4 own the absence of the old section.
 */
check("A2 — pasted, an unlanded branch's work is still never reported as shipped", () => {
  for (const l of sections(pastedNever)) {
    assert.ok(
      !hasSubject(l.body, "never: work in progress"),
      `unlanded work reported as landed under "${l.header}"`
    );
  }
  assert.ok(
    !pastedNever.includes("feature/never"),
    "an unconfirmed branch was named in the output"
  );
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

/**
 * A8's "exactly once" half, unchanged: the branch's commits render once and
 * nowhere else. Its "no section names this branch" half is narrowed by
 * git-log-landed-confirmation — path 3 now names it — which B14 covers.
 */
check("A8 — and its commits are reported exactly once", () => {
  assert.equal(countOf(pastedRebased, "rebased: one"), 1);
  assert.equal(countOf(pastedRebased, "rebased: two"), 1);
  assert.ok(!pastedRebased.includes("--- not yet on "), "a not-yet-landed section was emitted");
});

/**
 * A8's narrowed half, stated as a count by the preservation table: the old
 * probe asserted that *no* section named feature/rebased, and path 3 turns that
 * 0 into exactly 1. Asserted on this fixture and not only on B14's own, because
 * this is the shape the narrowing was measured against — a branch rebased onto
 * the base and fast-forwarded, with the base then moving on past it.
 *
 * Exactly one is the load-bearing number on both sides: 0 means path 3 stopped
 * reaching the fast-forward shape it exists for, and 2 means the header-only
 * section is double-counting commits that already render as `direct` landings.
 */
check("A8/B14 — the fast-forwarded branch gets exactly one section, header-only", () => {
  const named = sections(pastedRebased).filter((s) => s.header.includes("feature/rebased"));
  assert.equal(
    named.length,
    1,
    `expected exactly one section naming feature/rebased; got ${named.map((s) => s.header).join(" | ") || "none"}`
  );
  assert.equal(named[0].header, "--- confirmed landed on main branch: feature/rebased");
  assert.equal(named[0].body.trim(), "", `a header-only section carried a body: ${named[0].body}`);
});

/**
 * The predicate's paths are exclusive, and a merge-parsed name is already a
 * name: `namedAlready` must keep feature/merged out of the confirmed pass, or
 * the same branch reports twice — once with its commits, once as a bare
 * confirmation. Nothing else pins this; A1 only asserts the landed section is
 * present, which stays true when a spurious second section joins it.
 */
check("a branch named by its own merge landing gets no second, confirmed section", () => {
  const named = sections(pastedMerged).filter((s) => s.header.includes("feature/merged"));
  assert.deepEqual(
    named.map((s) => s.header),
    [MERGED_HEADER],
    "a merge-named branch was confirmed a second time by the predicate"
  );
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

/**
 * Characterization (docs/specs/git-log-marker-reserved-vocab.md, pre-refactor
 * safety net for the upcoming NUL/\x01 parsing rewrite of logArgs/runLog).
 * These two pin today's exact byte layout in shapes no existing check
 * constrains — every check touching a landed section's body so far uses loose
 * subject/substring matching (hasSubject, `assert.match` anchored per-line),
 * which a spacing regression sails straight through. Not D-series checks
 * (those, added alongside the fix itself, pin the new `=== `-forgery
 * behavior); these pin the old behavior the rewrite's Preservation contract
 * promises to reproduce byte-for-byte.
 */
check("characterization — a multi-commit landing's records are joined by exactly two blank lines", () => {
  // The Preservation contract names this exactly: "the double-blank-line gap
  // between records that --stat's own trailing blank line plus the next
  // record's leading %n used to produce."
  const s = section(noSelection, MERGED_HEADER);
  assert.ok(s, `expected a section headed "${MERGED_HEADER}"`);
  const [h1, h2] = hashesIn(s.body);
  assert.equal(
    s.body.replace(/\n+$/, ""),
    `=== ${h1} 2024-06-02 probe\nmerged: second\n\n merged-2.txt | 1 +\n 1 file changed, 1 insertion(+)` +
      `\n\n\n=== ${h2} 2024-06-01 probe\nmerged: first\n\n merged-1.txt | 1 +\n 1 file changed, 1 insertion(+)`,
    `record-to-record spacing drifted from today's byte layout; got: ${JSON.stringify(s.body)}`
  );
});

check("characterization — a body-less commit's block is subject, one blank line, then the diffstat verbatim", () => {
  const s = section(noSelection, "--- landed 2024-07-14 direct");
  assert.ok(s, "expected a direct landing");
  const [hash] = hashesIn(s.body);
  assert.equal(
    s.body.replace(/\n+$/, ""),
    `=== ${hash} 2024-06-15 probe\ndirect work on main\n\n direct.txt | 1 +\n 1 file changed, 1 insertion(+)`,
    `a body-less commit's rendered block drifted from today's byte layout; got: ${JSON.stringify(s.body)}`
  );
});

check("I1 — every commit under a landed section is reachable from the base", () => {
  const rendered = landedSections(noSelection).flatMap((s) => hashesIn(s.body));
  assert.ok(rendered.length > 0, "no commits rendered — the invariant would hold vacuously");
  for (const h of rendered) {
    assert.ok(isAncestorOfBase(h), `${h} is rendered as landed but is not an ancestor of main`);
  }
});

/**
 * J4 replaces I2. I2 governed the contents of not-yet-landed sections; with
 * that section kind gone from every selection mode, the invariant that carries
 * its weight is that the kind is absent — otherwise I2 would hold vacuously
 * and stop discriminating anything.
 */
check("J4 — no selection mode emits a not-yet-landed section", () => {
  for (const [label, out] of [
    ["pasted (unlanded branch)", pastedNever],
    ["pasted (squashed branch)", pastedSquashed],
    ["pasted (merged branch)", pastedMerged],
    ["pasted (rebased branch)", pastedRebased],
  ]) {
    assert.ok(!out.includes("--- not yet on "), `${label} emitted a not-yet-landed section`);
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

export { MERGED_HEADER, WINDOW, git, hashesIn, noSelection, repo };
