/**
 * Landed confirmation (B1-B16), the panel regressions on the window bound and
 * base identity, landing record parsing, and the spawn-layer rejection
 * predicate — everything asserted against the confirmation fixture family.
 */

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

import { manyOut } from "./caps-and-windows.mjs";
import { TABBED_MERGE_SUBJECT, buildBrokenRefFixture, buildConfirmationFixture, buildDashRefFixture, buildDualNameFixture, buildMessageParsingFixture, buildRemoteBaseFixture } from "./fixtures.mjs";
import { check, countOf, hasSubject, landedSections, makeGit, section, sections, t } from "./harness.mjs";
import { hashesIn, tryLoad } from "./selection-and-traversal.mjs";

/**
 * B1-B16 — the landed predicate. Every landing in this fixture is
 * single-parent, so nothing here is confirmable by the merge-subject path that
 * A1 covers: these criteria exercise the three paths git-log-landed-confirmation
 * adds, and the silence it requires everywhere else.
 */
console.log("landed confirmation (B1-B16)");

const confRepo = buildConfirmationFixture();
const conf = (memo, extra = "") => tryLoad([`${confRepo}${extra}`], memo);

const confNamed = await conf("shipped feature/named");
const confResolved = await conf("shipped feature/resolved");
const confRewritten = await conf("shipped feature/rewritten");
const confGeneric = await conf("shipped feature/generic");
const confReverted = await conf("shipped feature/reverted");
const confAncestor = await conf("shipped feature/ancestor");
const confFilePath = await conf("see src/core/thing.ts");
const confGlob = await conf("", " branches:feature/resolved");
const confBaseRef = await conf("", " branches:* since:2024-01-01T00:00:00Z");
const confGhost = await conf("shipped feature/ghost");
const confGlobAncestor = await conf("", " branches:feature/ancestor");
const confGlobNamed = await conf("", " branches:feature/globnamed since:2024-01-01T00:00:00Z");
const confGlobNothing = await conf("", " branches:feature/nothing-matches-this*");
// Every landing here predates 2025, so this window renders none of them while
// leaving the windowless predicate underneath untouched.
const confBaseRefNarrow = await conf("", " branches:* since:2025-01-01");
// An `until:`-only window. The panel found the default being applied here as
// well, producing `7 days ago .. <a past until>` — an empty range that deleted
// every nameless landing, in the repository shape (squash/rebase) where
// nameless landings *are* the work and `until:` is what a closed-period report
// uses. No existing check paired `until:` with a selection.
const confUntilOnly = await conf("shipped feature/resolved", " until:2024-08-12T23:59:59Z");
const confNoWindow = await conf("shipped feature/resolved");
const confTokenPrefix = await conf("shipped feature/tok");
const confTokenLonger = await conf("shipped feature/token-longer");
const confTokenGlued = await conf("shipped feature/pre");
const confTokenSecond = await conf("shipped feature/scan");
const confEmptySubject = await conf("shipped feature/emptysubject");
const confGlobUntilOnly = await conf("", " branches:feature/* until:2024-08-12T23:59:59Z");
// The same until:-only glob, wide enough to leave a *named* landing inside it:
// every named landing in this fixture is dated after 2024-08-12, so the check
// above can only ever observe the nameless side.
const confGlobUntilNamed = await conf("", " branches:feature/* until:2024-08-19T23:59:59Z");

const confirmedHeaders = (out) =>
  sections(out)
    .filter((s) => s.header.startsWith("--- confirmed landed on "))
    .map((s) => s.header)
    .sort();

/**
 * Every branch name reported by name anywhere — a `--- landed ... branch:`
 * header or a `--- confirmed landed on ... branch:` header (dated or not).
 * git-log-named-window-invariance's C3 needs this, not `confirmedHeaders`
 * alone: a named landing can move from the first form to the second as the
 * window narrows, so comparing only the second form's headers reads that
 * move as a changed confirmed set when the name itself never left.
 */
const reportedBranchNames = (out) =>
  [...out.matchAll(/^--- (?:landed \S+ branch|confirmed landed on \S+ branch): (\S+)/gm)]
    .map((m) => m[1])
    .sort();

check("B1 — a landing naming the branch confirms it, with no ref for it at all", () => {
  const s = section(confNamed, "--- landed 2024-08-10 branch: feature/named");
  assert.ok(s, `expected the landing to be named; got: ${confNamed}`);
  assert.ok(
    hasSubject(s.body, "Add the named feature (#7)"),
    "the landing's own commit is missing from its section"
  );
});

/**
 * Characterization (docs/specs/git-log-marker-reserved-vocab.md, pre-refactor
 * safety net) — the counterpart to the two body-less/multi-commit pins above,
 * for a commit whose message actually carries a body. No existing check
 * exercises a real multi-line body through runLog's rendering (every commit in
 * buildFixture() is subject-only); this pins that the body's own text follows
 * the subject with no blank line inserted (`%s%n%b` has none), while the
 * diffstat still gets its usual one blank line of separation regardless.
 */
check("characterization — a body-bearing commit's block is subject, body, one blank line, then the diffstat verbatim", () => {
  const s = section(confNamed, "--- landed 2024-08-10 branch: feature/named");
  assert.ok(s, `expected the landing to be named; got: ${confNamed}`);
  const [hash] = hashesIn(s.body);
  assert.equal(
    s.body.replace(/\n+$/, ""),
    `=== ${hash} 2024-08-10 probe\nAdd the named feature (#7)\nSquash-merge-from: feature/named` +
      `\n\n named.txt | 1 +\n 1 file changed, 1 insertion(+)`,
    `a body-bearing commit's rendered block drifted from today's byte layout; got: ${JSON.stringify(s.body)}`
  );
});

check("B2 — a candidate matching two or more landings confirms nothing", () => {
  assert.ok(
    !confFilePath.includes("--- confirmed landed on "),
    "a file-path token confirmed a branch"
  );
  assert.ok(
    !confFilePath.includes("branch: src/core/thing.ts"),
    "a file-path token was rendered as a branch name"
  );
});

check("B3 — revert/reapply landings are not match candidates", () => {
  assert.ok(
    confReverted.includes("--- confirmed landed on main branch: feature/reverted"),
    `re-landed work must stay confirmable; got: ${confReverted}`
  );
});

/**
 * B3's other half, which the check above cannot reach: exclusion has to cost
 * something as well as save something. feature/ghost is named by exactly one
 * landing and that landing is a revert, so without the exclusion this is an
 * unambiguous path-1 match and the branch is reported as shipped — the reverse
 * of what a revert means. The excluded landing is the *only* mention, so a
 * regression shows up as a section, not as a changed count.
 */
check("B3 — a name carried only by a revert's subject confirms nothing", () => {
  assert.ok(
    !confGhost.includes("feature/ghost"),
    `a revert's subject confirmed the branch it names; got: ${confGhost}`
  );
  assert.ok(
    !confGhost.includes("--- landed ") && !confGhost.includes("--- confirmed landed on "),
    `expected silence for a branch only a revert names; got: ${confGhost}`
  );
});

check("B4 — path 2 renders base-unique subjects, no bodies or diffstats", () => {
  const s = section(confResolved, "--- confirmed landed on main branch: feature/resolved");
  assert.ok(s, `expected a confirmed section; got: ${confResolved}`);
  assert.ok(hasSubject(s.body, "add the resolved thing"), "the base-unique subject is missing");
  assert.ok(!/^=== \w+ /m.test(s.body), "a commit line leaked into a subjects-only section");
  assert.ok(!s.body.includes("|"), "a diffstat leaked into a subjects-only section");
});

/**
 * B4's "empty subjects count". A commit carrying no subject can never resolve
 * against a landing, so dropping it from the unresolved list lets the count
 * reach zero on the strength of the one commit nothing accounts for — this
 * branch's other commit landed, this one did not, and filtering the blank line
 * out of `git log --pretty=%s` reports the branch as shipped anyway.
 */
check("B4 — a commit with no subject at all leaves its branch unconfirmed", () => {
  assert.ok(
    !confEmptySubject.includes("feature/emptysubject"),
    `a branch whose unaccounted-for commit has no subject was confirmed; got: ${confEmptySubject}`
  );
});

check("B5 — a subject recurring across landings cannot confirm", () => {
  assert.ok(
    !confGeneric.includes("feature/generic"),
    `a branch was confirmed by a subject that occurs twice; got: ${confGeneric}`
  );
});

check("B5 — a squash that rewrote the subject leaves the branch unconfirmed", () => {
  assert.ok(
    !confRewritten.includes("feature/rewritten"),
    `expected silence for an unconfirmable branch; got: ${confRewritten}`
  );
});

check("B6/J4 — no selection mode emits a not-yet-landed section", () => {
  for (const out of [confNamed, confResolved, confRewritten, confGeneric, confAncestor, confGlob]) {
    assert.ok(!out.includes("--- not yet on "), "a not-yet-landed section was emitted");
  }
});

/**
 * B8/C3 — "narrowing since: does not change which branches are confirmed,
 * only which landings render". Restated by git-log-named-window-invariance
 * over the stronger set the original B8 was reaching for: `confirmedHeaders`
 * alone breaks once a merge-parsed name can take the header-only form,
 * because narrowing the window here moves feature/globnamed, feature/scan
 * and feature/token-longer's landings out of `--- landed` sections and into
 * dated `--- confirmed landed on` ones — a real move, not a lost
 * confirmation. `reportedBranchNames` is invariant to which of the two forms
 * carried the name, so it is what the criterion actually requires.
 *
 * Both clauses have to be asserted together or the criterion passes for the
 * wrong reason: an unchanged name set proves nothing unless the narrowing
 * demonstrably reached the rendering (the check below), and a changed
 * rendering proves nothing unless the name set is watched.
 */
check("C3 — narrowing the window leaves the reported name set identical (B8, restated)", () => {
  const wide = reportedBranchNames(confBaseRef);
  assert.ok(wide.length > 0, "no branch is named at all — the comparison would hold vacuously");
  assert.deepEqual(
    reportedBranchNames(confBaseRefNarrow),
    wide,
    "a narrower since: changed which branch names were reported — the window reached the predicate"
  );
});

check("B8 — while the same narrowing does change which landings render", () => {
  assert.ok(
    landedSections(confBaseRef).length > 0,
    "no landing renders unwindowed — the narrowing below would prove nothing"
  );
  assert.equal(
    landedSections(confBaseRefNarrow).length,
    0,
    "a window past every landing still rendered one — the window never reached the rendering"
  );
});

check("B10 — glob mode confirms through path 2", () => {
  assert.ok(
    confGlob.includes("--- confirmed landed on main branch: feature/resolved"),
    `a glob-selected branch was not confirmed; got: ${confGlob}`
  );
});

/**
 * B10's remaining two paths. A glob supplies names the same way a memo does —
 * §Spec's "the predicate cannot tell how a branch was selected" — but the names
 * it supplies are the matched refs' `display` forms, and only these reach path 1
 * and path 3 through a glob. Path 1 in particular needs a ref to exist before a
 * glob can name it at all, which is why the fixture carries feature/globnamed
 * alongside the ref-less feature/named that B1 uses.
 */
check("B10 — glob mode confirms through path 3", () => {
  assert.ok(
    confGlobAncestor.includes("--- confirmed landed on main branch: feature/ancestor"),
    `a glob-selected ancestor was not confirmed; got: ${confGlobAncestor}`
  );
});

check("B10 — glob mode confirms through path 1, under the ref's display name", () => {
  const named = sections(confGlobNamed).filter((s) => s.header.includes("feature/globnamed"));
  assert.deepEqual(
    named.map((s) => s.header),
    ["--- landed 2024-08-18 branch: feature/globnamed"],
    `expected exactly one path-1 landed section; got: ${confGlobNamed}`
  );
  assert.ok(
    hasSubject(named[0].body, "Add the glob-named feature (#13)"),
    "the landing's own commit is missing from its section"
  );
});

/**
 * The exclusivity rule, whose only observable is this branch: its landing kept
 * the branch subject verbatim, so path 2 would confirm it just as readily. Two
 * sections here means the paths stopped stopping at the first success, and the
 * same commits report twice under two labels.
 */
check("B10 — and path 2 does not also confirm what path 1 already named", () => {
  assert.equal(
    confirmedHeaders(confGlobNamed).length,
    0,
    `a path-1 branch was confirmed a second time by path 2; got: ${confGlobNamed}`
  );
});

check("B10 — a glob matching neither a ref nor a landing name still raises git.no-branches", () => {
  assert.equal(
    confGlobNothing,
    `<threw: ${t("git.no-branches", { glob: "feature/nothing-matches-this*", path: confRepo })}>`
  );
});

check("B12 — the base ref is never confirmed, by any path", () => {
  assert.ok(
    !confBaseRef.includes("branch: main"),
    "the base ref confirmed itself (it is trivially its own ancestor)"
  );
});

check("B13 — a name that is a prefix of another landing's name is not confirmed by path 1", () => {
  // manyOut pastes feature/n1, whose name is a substring of the messages
  // naming feature/n10..n19 — eleven matches, so path 1 must decline.
  assert.equal(
    sections(manyOut).filter((s) => s.header === "--- confirmed landed on main branch: feature/n1")
      .length,
    0,
    "an ambiguous prefix name was confirmed by path 1"
  );
});

check("B14 — an ancestor branch is confirmed with a header and nothing else", () => {
  const s = section(confAncestor, "--- confirmed landed on main branch: feature/ancestor");
  assert.ok(s, `expected a header-only confirmation; got: ${confAncestor}`);
  assert.equal(s.body.trim(), "", `a header-only section carried a body: ${s.body}`);
});

check("B15 — the new label is parsed as a section but is not a landed section", () => {
  const parsed = sections(confResolved).map((s) => s.header);
  assert.ok(
    parsed.includes("--- confirmed landed on main branch: feature/resolved"),
    "the new label was swallowed into the preceding section's body"
  );
  assert.ok(
    landedSections(confResolved).every((s) => !s.header.startsWith("--- confirmed")),
    "the new label was counted as a `--- landed ` section — every count over them shifts"
  );
});

check("B16 — a branch that is not an ancestor produces no error", () => {
  assert.ok(
    !confGeneric.startsWith("<threw:"),
    `merge-base --is-ancestor exit 1 was treated as a failure: ${confGeneric}`
  );
});

/**
 * B16's other half. Exit 1 being an answer is a deliberate hole in this file's
 * "non-zero is fatal" contract, and a hole is only safe if its edges hold: the
 * exit codes that are *not* 1 must still fail loudly rather than read as a
 * quiet "not an ancestor" and hide a repository the user asked about.
 *
 * Reachability, recorded rather than glossed: the 128 a bad ref produces is
 * raised by the predicate's first git call (`git log <base>...<ref>`), not by
 * `isAncestor` — that runs only for a branch whose base-unique query already
 * succeeded, and a ref good enough for `git log` is good enough for
 * `merge-base`. `isAncestor`'s own 128 arm is therefore unreachable from
 * loadGitLog and no fixture here can exercise it; what B16 states and what this
 * pins is the observable contract — a bad ref anywhere in the predicate still
 * raises git.failed rather than being swallowed as a negative.
 */
const brokenRefRepo = buildBrokenRefFixture();
const brokenRefListed = makeGit(brokenRefRepo)([
  "for-each-ref",
  "--format=%(refname:short)",
  "refs/heads",
]);
const brokenRefOut = await tryLoad([`${brokenRefRepo} since:2024-01-01T00:00:00Z branches:feature/*`], "");
const brokenRefNoSelection = await tryLoad([`${brokenRefRepo} since:2024-01-01T00:00:00Z`], "");

check("B16 — the fixture's premise: the broken ref is visible to the branch scan", () => {
  assert.ok(
    brokenRefListed.split("\n").includes("feature/broken"),
    `for-each-ref does not see the planted ref, so nothing below reaches the predicate (ref backend: ${brokenRefListed.trim().split("\n").join(",")})`
  );
});

check("B16 — a bad ref (exit 128) still raises git.failed", () => {
  assert.ok(
    brokenRefOut.startsWith(`<threw: ${t("git.failed", { path: brokenRefRepo, error: "" })}`),
    `expected the git.failed contract; got: ${brokenRefOut}`
  );
});

check("B16 — and it is the predicate that raises it, not the landing walk", () => {
  assert.ok(
    !brokenRefNoSelection.startsWith("<threw:"),
    `the same repository failed with no selection at all: ${brokenRefNoSelection}`
  );
});

/**
 * §Spec's `--` before the two revisions. A ref may legally be named `-evil/x`,
 * and `merge-base --is-ancestor` is the one call that puts a ref where git's
 * option parser is still looking: without the separator it answers exit 129
 * (`unknown switch`), which is neither the 0 nor the 1 the predicate treats as
 * an answer, so a single dash-named branch anywhere in the selection fails the
 * whole callout. Nothing else here exercises path 3 with a hostile ref name —
 * every other branch in every fixture is ordinarily named.
 */
const dashRefRepo = buildDashRefFixture();
const dashRefListed = makeGit(dashRefRepo)([
  "for-each-ref",
  "--format=%(refname:short)",
  "refs/heads",
]);
const dashRefOut = await tryLoad([`${dashRefRepo} since:2024-01-01T00:00:00Z branches:*`], "");

check("the fixture's premise: the dash-named ref reaches the predicate", () => {
  assert.ok(
    dashRefListed.split("\n").includes("-evil/x"),
    `for-each-ref does not see the planted ref, so nothing below reaches path 3 (ref backend: ${dashRefListed.trim().split("\n").join(",")})`
  );
});

check("a dash-named ref is a revision to merge-base, not an option", () => {
  assert.ok(
    !dashRefOut.startsWith("<threw:"),
    `one dash-named branch failed the whole callout — the revisions must sit after '--': ${dashRefOut}`
  );
  assert.ok(
    sections(dashRefOut).some((s) => s.header === "--- confirmed landed on main branch: -evil/x"),
    `path 3 did not confirm the dash-named ancestor; got: ${dashRefOut}`
  );
});

/**
 * The two panel BLOCKs. Both lived in fixture gaps rather than in untested
 * logic — the shapes below are what no existing fixture produced, so the
 * checks are written against the shape, not against the symptom.
 */
console.log("panel regressions (window bound, base identity)");

check("B17 — an until:-only window renders nameless landings (pasted mode)", () => {
  // The default must apply only when the spec supplied *no* window at all.
  // Applied alongside `until:` it yields `7 days ago .. 2024-08-20` — empty.
  const nameless = sections(confUntilOnly).filter((s) => s.header.endsWith(" direct"));
  assert.ok(
    nameless.length > 0,
    `an until:-only window deleted every nameless landing; got: ${confUntilOnly}`
  );
  assert.ok(
    !confUntilOnly.includes("recent landings"),
    "the header still announces a default bound that is not in force"
  );
});

check("B17 — and until: still bounds what renders", () => {
  // The window is real, not merely restored: it keeps what precedes it and
  // drops what follows, so the fix cannot have been "ignore until: entirely".
  assert.ok(
    hasSubject(confUntilOnly, "Add the named feature (#7)"),
    `a landing dated inside until: was dropped; got: ${confUntilOnly}`
  );
  assert.ok(
    !hasSubject(confUntilOnly, "add the reverted thing"),
    "a landing dated after until: was rendered anyway"
  );
  // With no window at all the same nameless landings fall outside the 7-day
  // default instead — the two bounds are independent.
  assert.ok(
    !hasSubject(confNoWindow, "Add the named feature (#7)"),
    "the nameless default bound is not being applied when the spec gives no window"
  );
});

const remoteBaseRepo = buildRemoteBaseFixture();
const remoteBaseOut = await tryLoad([`${remoteBaseRepo} since:2024-01-01T00:00:00Z branches:*`]);

check("B18 — the base never confirms itself when it resolves to a remote ref", () => {
  assert.ok(
    !remoteBaseOut.includes("branch: main"),
    `the base confirmed itself through path 3; got: ${remoteBaseOut}`
  );
});

// The "B12 —" checks from here through the merge-parse one further down pin a
// broader claim than git-log-landed-confirmation.md's own B12 text ("a
// candidate naming the base ref itself is not confirmed and emits no section,
// by any path") — that sentence is about a *candidate*, and the check above
// (B12 — the base ref is never confirmed, by any path) is its only pin. These
// test a *landing* (one whose own message or merge subject names the base)
// never getting labelled with it — the rule git-log-base-named-merge.md /
// git-log-base-guard-pinning.md state as `M1`. Kept under the same prefix for
// the group's history, not because one contract's text covers all of them.

/**
 * B12's path-1 arm — §Spec's "excluded from the predicate *entirely*", on the
 * one path that queries no git: an exclusion applied only where git is called
 * (paths 2 and 3) misses it outright, path 1 matches the landing that names
 * the base, and the work log gains an entry for a branch called `main`.
 * Verified red against the pre-fix source: this fixture then renders
 * `--- landed 2024-09-02 branch: main` under `branches:*` and
 * `--- landed 2024-09-02 branch: origin/main` under the paste below.
 *
 * The premise is asserted first so the arm cannot go vacuous: the base-naming
 * landing must exist in the walk and stay *nameless* — the exclusion stops the
 * naming, never the landing itself.
 */
check("B12 — the fixture's premise: the base-naming landing renders, and stays nameless", () => {
  const s = section(remoteBaseOut, "--- landed 2024-09-02 direct");
  assert.ok(s, `the landing naming the base fell out of the walk; got: ${remoteBaseOut}`);
  assert.ok(
    hasSubject(s.body, "hotfix applied straight to main"),
    "the base-naming landing's own commit is missing from its direct section"
  );
});

check("B12 — a landing naming the base cannot label a section after it (glob mode)", () => {
  assert.equal(
    countOf(remoteBaseOut, "branch: main"),
    0,
    `path 1 named the base's own landing after the base; got: ${remoteBaseOut}`
  );
});

check("A12 — branches:* in a repository whose only branch is the base stays in selection mode", () => {
  // The exclusion is applied to `names`, the predicate's input — not to the
  // selection. Filtering the selection instead would leave zero matched
  // branches here and raise git.no-branches for a perfectly ordinary clone
  // whose only branch is its default.
  assert.ok(
    !remoteBaseOut.startsWith("<threw:"),
    `git.no-branches was raised — the base exclusion reached selection; got: ${remoteBaseOut}`
  );
  assert.ok(
    remoteBaseOut.includes(", branches *)"),
    `the selection note is missing from the header; got: ${remoteBaseOut.split("\n")[0]}`
  );
});

const remoteBasePasted = await tryLoad(
  [`${remoteBaseRepo} since:2024-01-01T00:00:00Z`],
  "picked up origin/main"
);

check("B12 — the base pasted in its ref form (origin/main) is named nowhere", () => {
  // `origin/main` is a valid pasted candidate — slash-bearing, git-ref
  // charset — and the fixture's landing names it exactly once, so without the
  // dual-form exclusion on the pasted path the base gets a landed section
  // under its remote spelling. The landing itself must keep rendering.
  assert.ok(!remoteBasePasted.startsWith("<threw:"), `expected output; got: ${remoteBasePasted}`);
  const s = section(remoteBasePasted, "--- landed 2024-09-02 direct");
  assert.ok(s, `the base-naming landing fell out of the pasted-mode walk; got: ${remoteBasePasted}`);
  assert.equal(
    countOf(remoteBasePasted, "branch: main") + countOf(remoteBasePasted, "branch: origin/main"),
    0,
    `the base was named under one of its spellings; got: ${remoteBasePasted}`
  );
  assert.ok(
    !remoteBasePasted.includes("--- confirmed landed on "),
    `the base earned a confirmed section from a paste; got: ${remoteBasePasted}`
  );
});

/**
 * The same until:-only rule, in glob mode. The first version of it covered
 * pasted mode only and survived a full panel that way: in glob mode the
 * default bounds the *named* side, so `DEFAULT_SINCE .. <a past until>` empties
 * the landings a closed-period report is asking for.
 */
check("B17 — an until:-only glob adds no default either", () => {
  assert.ok(
    !confGlobUntilOnly.includes(`since ${"7 days ago"}`),
    `a bare until: still drew the default; got the header: ${confGlobUntilOnly.split("\n")[0]}`
  );
  assert.ok(
    landedSections(confGlobUntilOnly).length > 0,
    `every named landing was filtered out by an empty range; got: ${confGlobUntilOnly}`
  );
});

/**
 * B17's glob half asks for the assertion on the *named* side — that is the
 * side a glob's default bounds, so that is the side an added default empties.
 * The check above observes only nameless landings, because every named landing
 * in this fixture is dated after its `until:`. This one is windowed to leave
 * one inside, and pins the other direction with a named landing dated past it.
 */
check("B17 — an until:-only glob still renders the named landings inside it", () => {
  assert.ok(
    section(confGlobUntilNamed, "--- landed 2024-08-18 branch: feature/globnamed"),
    `a named landing inside an until:-only glob window was deleted; got: ${confGlobUntilNamed}`
  );
  assert.ok(
    !section(confGlobUntilNamed, "--- landed 2024-08-21 branch: feature/scan"),
    "a named landing dated after until: was rendered anyway — the window bounds nothing"
  );
});

check("B19 — a glob with no since: keeps the 7-day default window", () => {
  // Preserved from the predecessor contract, which held it explicitly. Only a
  // pasted selection escapes the default; a glob names no specific branch, so
  // the argument for lifting the bound does not reach it.
  assert.ok(
    confGlob.includes("(since 7 days ago"),
    `a glob was allowed to walk all history; got the header: ${confGlob.split("\n")[0]}`
  );
  assert.ok(
    !confGlob.includes("(all history"),
    "a glob with no window reported all history"
  );
});

/**
 * Reached through loadGitLog, never by exporting the matcher — A14's precedent:
 * widening the module's public surface to make something testable is not
 * licensed. `feature/tok` has a ref and unresolvable work, and the only landing
 * mentioning anything like it names `feature/token-longer`. A bare substring
 * match confirms it; a token-bounded one does not.
 */
check("B13 — a branch name is matched as a token, not as a bare substring", () => {
  assert.ok(
    !confTokenPrefix.includes("branch: feature/tok\n") &&
      !confTokenPrefix.includes("branch: feature/tok "),
    `a name that is only a prefix of a longer mention confirmed; got: ${confTokenPrefix}`
  );
});

check("B13 — and the longer name it is a prefix of still confirms", () => {
  assert.ok(
    confTokenLonger.includes("branch: feature/token-longer"),
    `the delimited occurrence failed to confirm; got: ${confTokenLonger}`
  );
});

/**
 * The bound's leading side, which the pair above cannot reach: `feature/tok`
 * is rejected by the character that *follows* it, so an implementation that
 * only ever looked forward keeps both of those checks green. `feature/pre` is
 * mentioned exactly once, inside `docs/feature/pre`, with a clean character
 * after it — only the ref character before it can reject the occurrence, and
 * §Spec requires both sides.
 */
check("B13 — a name glued to what precedes it is not a mention either", () => {
  assert.ok(
    !confTokenGlued.includes("feature/pre"),
    `a name occurring inside a longer path confirmed; got: ${confTokenGlued}`
  );
});

/**
 * And the scan does not stop at the first occurrence it rejects. One landing
 * names feature/scan twice — glued to a path, then free-standing — so a search
 * that returns "no" on the first rejected hit loses a branch that a message
 * genuinely names. The two rules pull in opposite directions and only a
 * message carrying both shapes holds them apart.
 */
check("B13 — a rejected occurrence does not end the search for a clean one", () => {
  assert.ok(
    section(confTokenSecond, "--- landed 2024-08-21 branch: feature/scan"),
    `the free-standing second occurrence never confirmed; got: ${confTokenSecond}`
  );
});

/**
 * J1 — no branch name reaches the output on the strength of having been
 * selected. Stated as the complete section set rather than a per-branch spot
 * check: the invariant is about what is *absent*, and only pinning the whole
 * set catches a name that appears somewhere nobody thought to look.
 *
 * Every name the fixture defines is pasted at once, which is also the only
 * place the path-1 loop runs against a candidate list long enough for one
 * candidate's match to disturb another's.
 */
const CONF_ALL_NAMES = [
  "feature/named",
  "feature/globnamed",
  "feature/resolved",
  "feature/reverted",
  "feature/ancestor",
  "feature/rewritten",
  "feature/generic",
  "feature/ghost",
  "feature/typo-naming-nothing",
];
const confAllPasted = await conf(`shipped ${CONF_ALL_NAMES.join(" ")}`);

check("J1 — only names a path confirmed reach the output, and each exactly once", () => {
  assert.deepEqual(
    sections(confAllPasted)
      .map((s) => s.header)
      .sort(),
    [
      "--- confirmed landed on main branch: feature/ancestor",
      "--- confirmed landed on main branch: feature/resolved",
      "--- confirmed landed on main branch: feature/reverted",
      "--- landed 2024-08-10 branch: feature/named",
      "--- landed 2024-08-18 branch: feature/globnamed",
    ],
    `the emitted sections are not exactly the confirmed ones; got:\n${confAllPasted}`
  );
});

check("J1 — an unconfirmed selected name appears nowhere in the output at all", () => {
  for (const name of ["feature/rewritten", "feature/generic", "feature/ghost", "feature/typo-naming-nothing"]) {
    assert.ok(
      !confAllPasted.includes(name),
      `${name} was named in the output without any path confirming it`
    );
  }
});

/**
 * B11 — one landing, and both spellings of its branch pasted at once. Both
 * candidates match this landing's message, and what the criterion asks is that
 * it still yields one section and renders its commits once.
 *
 * Measured while writing this, and recorded because the contract reads the
 * other way: dropping the "one landing carries at most one name" rule changes
 * neither count — a landing is one object and renders once however many
 * candidates label it — it changes only *which* candidate's spelling reaches
 * the header. That name is the half deliberately left unasserted here: pasting
 * the ref form first yields `origin/feature/dual` where §Spec's rendered-name
 * rule calls for the ref's `display`. The divergence is escalated to the user,
 * not pinned in either direction.
 */
const dualRepo = buildDualNameFixture();
const dualDisplayFirst = await tryLoad(
  [`${dualRepo} since:2024-01-01T00:00:00Z`],
  "picked up feature/dual and origin/feature/dual"
);
const dualRefFirst = await tryLoad(
  [`${dualRepo} since:2024-01-01T00:00:00Z`],
  "picked up origin/feature/dual and feature/dual"
);

check("B11 — both spellings pasted yield exactly one section for the landing", () => {
  for (const [label, out] of [
    ["display form first", dualDisplayFirst],
    ["ref form first", dualRefFirst],
  ]) {
    const named = sections(out).filter((s) => s.header.includes("feature/dual"));
    assert.equal(
      named.length,
      1,
      `${label}: expected one section; got ${named.map((s) => s.header).join(" | ") || "none"}`
    );
    assert.equal(
      countOf(out, "Add the dual feature (#11)"),
      1,
      `${label}: the landing's commit rendered more than once — I3 broken`
    );
  }
});

/**
 * The record format `enumerateLandings` moved to when it started reading `%b`.
 * Both shapes below are silent failures rather than crashes if it regresses: a
 * newline-delimited record truncates the body at its first blank line, and a
 * tab-delimited field truncates a subject at its first tab. Neither shows up
 * as an error — the branch simply stops being confirmable, and the header
 * simply says less than the commit did.
 */
console.log("landing record parsing (NUL records, \\x01 fields)");

const parsingRepo = buildMessageParsingFixture();
const parsingOut = await tryLoad([`${parsingRepo} since:2024-09-01T00:00:00Z`], "shipped feature/multiline");

/**
 * This landing's subject also carries a tab, so the same check covers the
 * field side: only a delimiter no message can contain keeps `%b` at the field
 * position the parser reads it from, and a subject that splits into two fields
 * pushes the body out of reach whether or not a blank line is involved.
 */
check("a multi-paragraph body is read whole, so path 1 sees a name below a blank line", () => {
  const s = section(parsingOut, "--- landed 2024-09-03 branch: feature/multiline");
  assert.ok(s, `the branch name sits past two blank lines and was not found; got: ${parsingOut}`);
  assert.ok(
    hasSubject(s.body, "second paragraph"),
    "the body was truncated before its later paragraphs"
  );
});

check("a tab inside a subject survives into the merge header intact", () => {
  const headers = sections(parsingOut).map((s) => s.header);
  assert.ok(
    headers.includes(`--- landed 2024-09-02 merge: ${TABBED_MERGE_SUBJECT}`),
    `a tabbed subject was truncated at the tab; headers: ${headers.join(" | ")}`
  );
});

/**
 * The predicate's *rejection* arm — the half B16 cannot reach. B16 covers a
 * non-zero exit (128, a bad ref): git ran and answered. `runGit` also rejects
 * outright, and never with an exit code at all: `cp.spawn` throwing
 * (git-log.ts:176-180), the child's `error` event, the GIT_TIMEOUT_MS timer,
 * or every candidate binary coming back ENOENT. §Spec requires both new query
 * helpers to map that onto the same git.failed contract every other call site
 * raises, and without `runPredicateGit`'s try/catch the raw rejection escapes
 * loadGitLog unmapped — a different error surface for the same user-visible
 * failure. All four arms funnel into one rejected promise, so the cheapest one
 * stands for the set: a synchronous throw from spawn, which starts no process.
 *
 * This is the only stub in this file, and it earns the exception by being the
 * only shape a real git repository cannot produce — every other check here
 * builds a fixture and reads what git actually says. It is deliberately last:
 * every fixture above has finished its work, the patch fires only on the
 * predicate's own two queries (`--right-only`, `--is-ancestor`), and it is
 * restored in a finally so a failing assert still hands the real spawn back.
 * The probe's own git calls go through execFileSync, which this cannot touch.
 */
console.log("the predicate maps a spawn-layer rejection onto git.failed");

const childProcess = createRequire(import.meta.url)("child_process");
const realSpawn = childProcess.spawn;
let spawnRejectOut;
let spawnRejectNoSelection;
try {
  childProcess.spawn = (bin, args, options) => {
    // Only the predicate's own queries: a blanket failure would be raised by
    // resolveBaseRef's fallback instead, which maps to git.failed through
    // runLog and would pass this check with runPredicateGit deleted.
    if (args.includes("--right-only") || args.includes("--is-ancestor")) {
      throw new Error("probe: forced spawn failure");
    }
    return realSpawn(bin, args, options);
  };
  spawnRejectOut = await tryLoad([`${confRepo} since:2024-01-01T00:00:00Z`], "shipped feature/resolved");
  spawnRejectNoSelection = await tryLoad([`${confRepo} since:2024-01-01T00:00:00Z`]);
} finally {
  childProcess.spawn = realSpawn;
}

check("the spawn is restored before anything else runs", () => {
  assert.equal(childProcess.spawn, realSpawn, "the patched spawn leaked past its own block");
});

check("a spawn-layer rejection in the predicate raises the git.failed contract", () => {
  assert.ok(
    spawnRejectOut.startsWith(`<threw: ${t("git.failed", { path: confRepo, error: "" })}`),
    `a rejection escaped unmapped, so the same failure reaches the user two ways; got: ${spawnRejectOut}`
  );
});

check("and it is the predicate that raises it — no selection, no rejection", () => {
  assert.ok(
    !spawnRejectNoSelection.startsWith("<threw:"),
    `the same repository failed with no selection at all, so the stub reached past the predicate: ${spawnRejectNoSelection}`
  );
});

export { confAncestor, confResolved, dualDisplayFirst, dualRefFirst, reportedBranchNames };
