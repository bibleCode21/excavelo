/**
 * What survives the branch cap and the time window: the prompt rules (A9), the
 * filter-before-cap order (A11), the scan cap's base exclusion, A16, the
 * default window's fall-through (A12), the glob matcher's backtracking bound
 * (A14) with its three measured timings, and the starter templates (A15).
 *
 * A9 and A15 touch neither a cap nor a window; they are here because the split
 * follows the original section order, and moving them would reorder the output.
 *
 * Exports `many`, `manyOut` and `win` — the many-landings fixture and the two
 * outputs confirmation.mjs and base-naming.mjs go on asserting against.
 */

import assert from "node:assert/strict";
import path from "node:path";

import { HUGE_NAME_LENGTH, buildDefaultWindowFixture, buildLongSubjectFixture, buildManyConfirmableBranchesFixture, buildManyLandingsFixture, buildSelectedLandingCrowdedByNamelessFixture } from "./fixtures.mjs";
import { MAX_BRANCHES, MAX_GLOB_LENGTH, STARTER_TEMPLATES, buildPrompt, check, countOf, hasSubject, landedSections, loadGitLog, makeGit, section, sections, t } from "./harness.mjs";
import { MERGED_HEADER, WINDOW, repo } from "./selection-and-traversal.mjs";

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

/**
 * A9 narrows under git-log-landed-confirmation: the landed-wins rule had a
 * counterpart to win against, and with not-yet-landed sections gone there is
 * nothing left for it to arbitrate. What must still be emitted is the label
 * vocabulary — now including the new label — and the rule that nothing in the
 * log is ever pending. B9 owns the positive half for the templates.
 */
const NOTHING_PENDING =
  "Work that has not reached the default branch is not in the GIT LOG at all. Never report anything from it as in progress, pending, or not yet shipped.";
const NEW_LABEL_RULE = "--- confirmed landed on <base> branch: <name>";

const withGit = buildPrompt(ctxWith("--- landed 2024-07-14 direct\n=== abc1234 2024-06-15 probe\nwork"));
const withoutGit = buildPrompt(ctxWith(null));

check("A9 — the label vocabulary and the nothing-is-pending rule are emitted", () => {
  const rules = withGit.user.slice(withGit.user.indexOf("=== OUTPUT RULES ==="));
  assert.ok(rules.includes(NEW_LABEL_RULE), "the new label is missing from the vocabulary rule");
  assert.ok(rules.includes("'--- landed <date>'"), "the landed label is missing from the vocabulary");
  assert.ok(rules.includes(NOTHING_PENDING), "the nothing-is-pending rule is missing or reworded");
  assert.ok(
    !rules.includes("--- not yet on"),
    "a rule still instructs the model about not-yet-landed sections"
  );
});

check("A9/I4 — exactly one === GIT LOG === block", () => {
  assert.equal(countOf(withGit.user, "=== GIT LOG ==="), 1);
});

check("A9 — no gitLog: no GIT LOG block and no git rules", () => {
  assert.equal(countOf(withoutGit.user, "=== GIT LOG ==="), 0);
  assert.ok(!withoutGit.user.includes(NOTHING_PENDING));
  assert.ok(!withoutGit.user.includes(NEW_LABEL_RULE));
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
 * `loadConfirmedSections` must exclude the base ref from the eligible set
 * *before* slicing to MAX_BRANCHES, not after. A `branches:*` glob selects
 * every branch, the base included, so the base competes for a scan slot unless
 * it is filtered out up front. This does not follow from any of A1-A16 — none
 * of them puts more than MAX_BRANCHES branches through the predicate — so it
 * had no coverage before this probe.
 *
 * The fixture squash-lands every one of its branches: under the confirmation
 * predicate an unlanded branch is confirmed by nothing and emits nothing, so a
 * fixture of unlanded branches would leave the cap with nothing to truncate
 * and these checks with nothing to observe.
 */
console.log("the scan cap excludes the base ref before slicing");

const manyConfirmable = buildManyConfirmableBranchesFixture(MAX_BRANCHES + 1);
const capScanOut = await loadGitLog([`${manyConfirmable} since:2024-01-01T00:00:00Z branches:*`]);

check("base ref never gets its own confirmed section", () => {
  assert.ok(
    !capScanOut.includes("--- confirmed landed on main branch: main"),
    "the base ref confirmed itself — it is trivially its own ancestor (path 3)"
  );
});

check("the over-cap notice counts real branches, not the base ref", () => {
  assert.ok(
    capScanOut.includes(`of ${MAX_BRANCHES + 1} selected branches were examined`),
    `expected the notice to count ${MAX_BRANCHES + 1} real branches; got: ${capScanOut.slice(capScanOut.indexOf("(only"))}`
  );
});

check("base ref does not waste a cap slot ahead of a real branch", () => {
  // 51 real branches over a cap of 50 evicts exactly one (the oldest,
  // feature/u1) when base is excluded first. If base instead occupies a
  // slot, feature/u2 is evicted too — that second eviction is the bug.
  assert.ok(
    hasSubject(capScanOut, "unit 2 work"),
    "feature/u2 was evicted — the base ref must be excluded before the cap slice, not after"
  );
});

/**
 * The same eviction read off the scan's own output, plus the half no check
 * has: that the scan cap *truncates*. The subject check above holds whenever
 * `unit 2 work` is anywhere in the output, and it is there for two independent
 * reasons — u2's confirmed section, or u2's landing, which sits one slot
 * outside the landing cap today and would slide back in on any change to the
 * fixture's size. A cap lifted altogether keeps every subject in the output
 * and passes it; only the u1 half below notices.
 *
 * Headers are compared exactly, never with includes(): `feature/u1` is a
 * prefix of `feature/u10`, so a substring test for the evicted branch matches
 * a branch that was not evicted at all.
 */
check("the slot the base does not take goes to a real branch (confirmed section)", () => {
  const headers = sections(capScanOut).map((s) => s.header);
  assert.ok(
    headers.includes("--- confirmed landed on main branch: feature/u2"),
    `feature/u2 was never scanned — the base must leave the eligible set before the cap slice; got: ${headers.filter((h) => h.startsWith("--- confirmed")).join(" | ")}`
  );
  assert.ok(
    !headers.includes("--- confirmed landed on main branch: feature/u1"),
    "51 eligible branches over a cap of 50 must truncate the scan by exactly one"
  );
});

/**
 * The notice reports a scan that was *cut short*, never one that merely
 * reached the cap number: 50 eligible branches over a cap of 50 leaves nothing
 * unexamined, so a notice there tells the model a truncation happened that did
 * not. Pasted mode with exactly MAX_BRANCHES names is the cheapest shape that
 * reaches the boundary — no window, so no landing renders and the run costs
 * the predicate alone.
 */
const capExactOut = await loadGitLog(
  [manyConfirmable],
  Array.from({ length: MAX_BRANCHES }, (_, i) => `feature/u${i + 1}`).join(" ")
);

check("the over-cap notice stays silent when every eligible branch was examined", () => {
  assert.equal(
    sections(capExactOut).filter((s) => s.header.startsWith("--- confirmed landed on ")).length,
    MAX_BRANCHES,
    "the premise: all MAX_BRANCHES eligible branches are examined and confirmed here"
  );
  assert.ok(
    !capExactOut.includes("selected branches were examined"),
    `the notice fired with nothing truncated: ${capExactOut.slice(capExactOut.indexOf("(only"))}`
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
const crowdedOut = await loadGitLog([`${crowded} since:2024-01-01T00:00:00Z`], "picked up feature/selected");

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

/**
 * B7 — the window split, which is the whole of what a selection now does to
 * nameless landings and had no assertion of its own: A13 pins that a *named*
 * landing takes no default, and A3/A4/A6 pin nameless landings under an
 * explicit window, but nothing observed the one case the split was built for —
 * a selection with no spec window, where named and nameless are bounded
 * differently in the same output.
 *
 * This fixture already straddles the live boundary: `feature/old`'s landing is
 * named and dated 2024 (outside the default forever), the root commit is
 * nameless and equally old, and `recent work` is nameless and two days back.
 * Nothing here asserts an absolute date.
 */
check("B7 — a selection bounds nameless landings by the default, named ones not at all", () => {
  assert.ok(
    hasSubject(pastedOld, "old: work"),
    "a named landing outside the default window was dropped — named landings take no default"
  );
  assert.ok(
    hasSubject(pastedOld, "recent work"),
    "a nameless landing inside the default window was dropped — the bound is not a blanket drop"
  );
  assert.ok(
    !hasSubject(pastedOld, "base"),
    "a nameless landing outside the default window was emitted — the pasted-mode history dump is back"
  );
});

check("B7 — and the header names that bound as its own clause, beside the spec's", () => {
  const header = pastedOld.split("\n")[0];
  assert.ok(header.includes("(all history"), `the spec's window stopped being reported: ${header}`);
  assert.ok(
    header.includes("recent landings 7 days ago"),
    `the nameless bound is in force but unreported: ${header}`
  );
});

/**
 * The other half of B7: a spec window *replaces* that default rather than
 * intersecting with it, so the same nameless landing the default hid renders
 * once the spec reaches back far enough. Without this, a bound hardcoded to
 * DEFAULT_SINCE for nameless landings would pass every check above.
 */
const pastedOldWide = await loadGitLog([`${win} since:2024-01-01T00:00:00Z`], "finished feature/old");

check("B7 — a spec window replaces the nameless default, it does not intersect it", () => {
  assert.ok(
    hasSubject(pastedOldWide, "base"),
    "a nameless landing inside the spec window but outside the default was still dropped"
  );
  assert.ok(hasSubject(pastedOldWide, "old: work"), "the named landing is missing");
  assert.ok(
    !pastedOldWide.split("\n")[0].includes("recent landings"),
    `the default bound was reported while a spec window was in force: ${pastedOldWide.split("\n")[0]}`
  );
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
const redosOut = await loadGitLog([`${redos} since:2024-01-01T00:00:00Z branches:**/hotfix`]);
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
  separatedStarsOut = await loadGitLog([`${redos} since:2024-01-01T00:00:00Z branches:${"a*".repeat(8)}zzz`]);
} catch (e) {
  separatedStarsOut = e.message; // git.no-branches is an acceptable outcome; the timing is what matters
}
const elapsedSeparated = performance.now() - t1;
console.log(`       (loadGitLog over the same subject, 8 literal-separated stars: ${elapsedSeparated.toFixed(0)}ms)`);

check("A14 — literal-separated stars over a 100k merge subject returns well under a second", () => {
  assert.ok(elapsedSeparated < 1000, `took ${elapsedSeparated.toFixed(0)}ms`);
});

/**
 * A14 continued — security-panel regression: globMatch is O(text.length *
 * glob.length), not O(text.length). Bounded on the text side by nothing (a
 * third party's merge subject is unbounded by design), so the glob side needs
 * its own bound or a long-enough glob quadratically compounds against a long
 * subject. Two checks: a too-long glob is refused outright (falls through as
 * a non-match, same as any other glob that selects nothing), and a
 * worst-case-shaped glob sitting exactly at the cap still returns fast
 * against the 100k-char subject — the cap has to hold at its own boundary,
 * not just somewhere comfortably under it.
 */
const overLongGlob = "*".repeat(MAX_GLOB_LENGTH + 1);
let overLongGlobError = null;
try {
  await loadGitLog([`${redos} since:2024-01-01T00:00:00Z branches:${overLongGlob}`]);
} catch (e) {
  overLongGlobError = e.message;
}

check("A14 — a glob over MAX_GLOB_LENGTH matches nothing, even one that is all stars", () => {
  assert.equal(overLongGlobError, t("git.no-branches", { glob: overLongGlob, path: redos }));
});

// Worst-case shape at the cap boundary: one star, then (MAX_GLOB_LENGTH - 2)
// a's, then a trailing b — matches every a-prefix of the subject up to the
// last character before failing, forcing a full retry at every shift.
const worstCaseGlob = `*${"a".repeat(MAX_GLOB_LENGTH - 2)}b`;
const t2 = performance.now();
await loadGitLog([`${redos} since:2024-01-01T00:00:00Z branches:${worstCaseGlob}`]).catch(() => {});
const elapsedWorstCase = performance.now() - t2;
console.log(`       (loadGitLog over the same subject, worst-case glob at MAX_GLOB_LENGTH: ${elapsedWorstCase.toFixed(0)}ms)`);

check("A14 — a worst-case glob at the MAX_GLOB_LENGTH cap returns well under a second", () => {
  assert.ok(elapsedWorstCase < 1000, `took ${elapsedWorstCase.toFixed(0)}ms`);
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

/**
 * A15 narrows with A9: neither template can route a section kind that is no
 * longer emitted. B9 replaces both halves — the negative (no not-yet-landed
 * wiring survives anywhere) and the positive (both templates name the new
 * label, or a confirmed section would fall through every selector they have).
 */
check("B9 — no not-yet-landed wiring survives in either template", () => {
  for (const [name, body] of [
    ["work-log.md", workLog],
    ["work-report.md", workReport],
  ]) {
    assert.ok(!body.includes("--- not yet on"), `${name} still routes not-yet-landed sections`);
    assert.ok(
      !body.includes("not-yet-landed"),
      `${name} still instructs the model about not-yet-landed sections`
    );
  }
});

check("B9 — both templates name the new label", () => {
  for (const [name, body] of [
    ["work-log.md", workLog],
    ["work-report.md", workReport],
  ]) {
    assert.ok(
      body.includes("--- confirmed landed on <base> branch: <name>"),
      `${name} does not name the confirmed-landed label — such a section would fall through`
    );
  }
});

/**
 * C7 — git-log-named-window-invariance. A header-only confirmed section now
 * has a third reason (a cap-evicted or out-of-window named landing), not just
 * the two A9/B9 shipped ("its commits are among the `--- landed` sections
 * instead"). Both templates and the prompt rule must say the commits can also
 * be nowhere in the log, or the model is told to hunt for commits that do not
 * exist. Each must also explain the `(landed <date>)` suffix, since a reader
 * who does not know it exists has no way to tell a dated header-only section
 * from a dateless (path-3, ancestry-only) one.
 */
check("C7 — both templates and the prompt rule cover the third header-only reason", () => {
  for (const [name, body] of [
    ["work-log.md", workLog],
    ["work-report.md", workReport],
    ["prompt.ts's git rule", withGit.user],
  ]) {
    assert.ok(
      body.includes("not in this log at all"),
      `${name} still says a header-only section's commits are always among the '--- landed' sections`
    );
  }
});

check("C7 — both templates and the prompt rule describe the date suffix", () => {
  for (const [name, body] of [
    ["work-log.md", workLog],
    ["work-report.md", workReport],
    ["prompt.ts's git rule", withGit.user],
  ]) {
    assert.ok(
      body.includes("(landed <date>)"),
      `${name} does not describe the '(landed <date>)' suffix`
    );
  }
});

check("B9 — In progress / carried over is memo-sourced only", () => {
  const heading = "## In progress / carried over";
  const idx = workReport.indexOf(heading);
  assert.ok(idx >= 0, "the In progress / carried over section is gone");
  const body = workReport.slice(idx);
  assert.ok(
    body.includes("Only what the memo itself describes as unfinished"),
    "the section still claims a GIT LOG source"
  );
});

export { many, manyOut, win };
