/**
 * Everything about a merge that names the base ref: named window invariance
 * (C1-C9), the Landing.branch write-boundary characterization, the merge
 * parses themselves (E1-E7), the nameless cap priority, the windowed-out
 * header-only path, path 1's renames, and the base-naming edges (F1-F7).
 */

import assert from "node:assert/strict";
import path from "node:path";

import { many, win } from "./caps-and-windows.mjs";
import { confAncestor, confResolved, dualDisplayFirst, dualRefFirst, reportedBranchNames } from "./confirmation.mjs";
import { buildBaseNamedMergeCrowdedFixture, buildBaseNamedMergeFixture, buildBaseRefGlobFixture, buildDisplayCollisionFixture, buildPathOneOnlyFixture, buildRemoteTrackingMergedFixture, buildUnpulledCloneFixture, buildWriteBoundaryFixture } from "./fixtures.mjs";
import { MAX_BRANCHES, check, countOf, hasSubject, landedSections, section, sections, t } from "./harness.mjs";
import { MERGED_HEADER, WINDOW, noSelection, repo, tryLoad } from "./selection-and-traversal.mjs";

/**
 * C1-C9 — git-log-named-window-invariance. A named confirmation (path 1's
 * message match, or a merge-parsed name) is window-invariant: narrowing the
 * window never drops the branch's name from the output, only whether its
 * commits are shown alongside it. Three shapes were measured end to end
 * before this contract (checkpoints/git-log-landed-repros/): a merge-parsed
 * name outside a glob's default window (C1), a pasted name outside an
 * explicit window on a branch paths 2 and 3 both fail (C2), and a
 * merge-parsed name whose only pasted spelling is the branch's ref form,
 * no window involved at all (C4).
 */
console.log("named window invariance (C1-C9)");

const c1Out = await tryLoad([`${repo} branches:feature/merged`]);

const baseNamedMergeRepo = buildBaseNamedMergeFixture();
// No window: the merges are dated 2024, so DEFAULT_SINCE excludes them from
// rendering and only the header-only path this contract's fix targets is
// reachable. The wide-window shape — where the merge renders in full and used
// to carry the base's own name in its header — was a pre-existing gap in the
// render side, deferred out of this contract and closed by
// git-log-base-named-merge; E1 is where it is pinned now.
const baseNamedMergeOut = await tryLoad([`${baseNamedMergeRepo} branches:*`]);

check("B12 — a merge subject parsing to the base's own name does not confirm the base (panel regression)", () => {
  assert.ok(
    !baseNamedMergeOut.includes("branch: main"),
    `the base confirmed itself via a merge-parsed name; got: ${baseNamedMergeOut}`
  );
});

check("C1 — a merge-parsed name outside the default window is reported header-only, dated", () => {
  assert.ok(
    c1Out.includes("--- confirmed landed on main branch: feature/merged (landed 2024-07-10)"),
    `expected a dated header-only confirmed section; got: ${c1Out}`
  );
  assert.ok(
    !hasSubject(c1Out, "merged: first"),
    "the landing's commits rendered even though it is outside the default window"
  );
});

check("C5 — the date suffix appears only on the name-confirmed form, never on paths 2/3", () => {
  assert.ok(c1Out.includes("(landed 2024-07-10)"), "the name-confirmed header lost its date suffix");
  assert.ok(
    confAncestor.includes("--- confirmed landed on main branch: feature/ancestor") &&
      !confAncestor.includes("branch: feature/ancestor (landed"),
    "a path-3 (ancestry-only) header gained a date suffix it must not carry"
  );
  assert.ok(
    section(confResolved, "--- confirmed landed on main branch: feature/resolved"),
    "expected the path-2 confirmed section"
  );
  assert.ok(
    !confResolved.includes("branch: feature/resolved (landed"),
    "a path-2 header gained a date suffix it must not carry"
  );
});

check("C6 — a name-confirmed header-only section is its own section, not a landed section, and reported exactly once", () => {
  assert.equal(
    sections(c1Out).filter((s) => s.header.includes("feature/merged")).length,
    1,
    "feature/merged was reported more than once"
  );
  assert.equal(
    landedSections(c1Out).length,
    0,
    "the header-only confirmed section was counted as a landed section"
  );
});

const pathOneOnlyRepo = buildPathOneOnlyFixture();
const p1Wide = await tryLoad([`${pathOneOnlyRepo} since:2024-01-01T00:00:00Z`], "shipped feature/p1");
const p1Narrow = await tryLoad([`${pathOneOnlyRepo} since:2024-09-01T00:00:00Z`], "shipped feature/p1");

check("C2 — a path-1-only branch (paths 2 and 3 both fail) renders in full inside its window", () => {
  const s = section(p1Wide, "--- landed 2024-07-10 branch: feature/p1");
  assert.ok(s, `expected the naming landing to render in full; got: ${p1Wide}`);
  assert.ok(
    hasSubject(s.body, "wrap up the work from feature/p1"),
    "the naming landing's own commit is missing from its section"
  );
});

check("C2 — the same branch is reported header-only, dated, once its landing falls outside the window", () => {
  assert.ok(
    p1Narrow.includes("--- confirmed landed on main branch: feature/p1 (landed 2024-07-10)"),
    `expected a dated header-only confirmed section; got: ${p1Narrow}`
  );
  assert.ok(
    !hasSubject(p1Narrow, "wrap up the work from feature/p1"),
    "the landing's commit rendered even though it is outside the window"
  );
});

const remoteOnlyMergedRepo = buildRemoteTrackingMergedFixture();
const c4Wide = await tryLoad(
  [`${remoteOnlyMergedRepo} since:2024-01-01T00:00:00Z`],
  "picked up origin/feature/remoteonly"
);
const c4Narrow = await tryLoad(
  [`${remoteOnlyMergedRepo} since:2024-03-01T00:00:00Z`],
  "picked up origin/feature/remoteonly"
);

check("C4 — pasting only the ref spelling still renders a merge-parsed landing, under its display name", () => {
  const s = section(c4Wide, "--- landed 2024-02-02 branch: feature/remoteonly");
  assert.ok(s, `expected the landing to render under the ref's display form; got: ${c4Wide}`);
  assert.ok(hasSubject(s.body, "remoteonly: the work"), "the landing's commit is missing");
});

check("C4 — narrowing the window over the same branch moves it to the header-only form", () => {
  assert.ok(
    c4Narrow.includes("--- confirmed landed on main branch: feature/remoteonly (landed 2024-02-02)"),
    `expected a dated header-only confirmed section; got: ${c4Narrow}`
  );
});

/**
 * C4's own text is explicit that the wide case gets "no header-only form, no
 * silence" — not just that it renders in full. Without this, a regression
 * that reported feature/remoteonly *both* ways (full render and a
 * header-only section on top) would still pass the check above, since that
 * only looks for the rendered section's presence.
 */
check("C4 — the ref-spelling landing gets no header-only section on top of its full render", () => {
  assert.ok(
    !c4Wide.includes("--- confirmed landed on main branch: feature/remoteonly"),
    `feature/remoteonly rendered in full and also got a header-only section; got: ${c4Wide}`
  );
});

const manyLandingDate = (i) =>
  new Date(Date.UTC(2024, 4, 1, 12) + i * 86_400_000).toISOString().slice(0, 10);

const c8Out = await tryLoad([`${many} since:2024-01-01 branches:*`]);

check("C8 — a named landing the landing-side cap evicts is still reported header-only", () => {
  for (let i = 1; i <= 5; i++) {
    const date = manyLandingDate(i);
    assert.ok(
      c8Out.includes(`--- confirmed landed on main branch: feature/n${i} (landed ${date})`),
      `feature/n${i} (evicted by the landing cap) was not reported header-only`
    );
  }
  assert.equal(
    landedSections(c8Out).length,
    50,
    "expected exactly the 50 most recent landings to render in full"
  );
});

/**
 * C9's own text: "the notice stays absent when nothing was truncated" — the
 * header-only kind's over-cap notice must fire only on an actual truncation,
 * mirroring the scan cap's own "stays silent" check ("the over-cap notice
 * stays silent when every eligible branch was examined", above). C8's
 * fixture is the cheapest shape that already computes this: only 5 landings
 * (n1-n5) are header-only candidates there, nowhere near the 50 cap, so no
 * "___ branches confirmed by name were listed" notice must appear.
 */
check("C9 — the header-only over-cap notice stays silent when nothing was truncated", () => {
  assert.ok(
    !c8Out.includes("branches confirmed by name were listed"),
    `the header-only notice fired with only 5 candidates, well under the cap: ${c8Out.slice(c8Out.indexOf("(only"))}`
  );
});

const c9Out = await tryLoad([`${many} branches:*`]);

check("C9 — the header-only kind has its own cap, its own notice, and excludes what it truncates from paths 2/3 too", () => {
  assert.equal(
    landedSections(c9Out).length,
    0,
    "nothing should render in full — every landing here is dated 2024, outside the 7-day default"
  );
  const names = reportedBranchNames(c9Out);
  for (let i = 1; i <= 5; i++) {
    assert.ok(
      !names.includes(`feature/n${i}`),
      `feature/n${i} (truncated by the header-only cap) still appeared by name — it is an ancestor, so path 3 must not have re-confirmed it`
    );
  }
  for (let i = 6; i <= 55; i++) {
    assert.ok(names.includes(`feature/n${i}`), `feature/n${i} is missing from the header-only set`);
  }
  assert.equal(names.length, MAX_BRANCHES, `expected exactly ${MAX_BRANCHES} branch names reported`);
  assert.ok(
    c9Out.includes(`(only the ${MAX_BRANCHES} most recent of 55 branches confirmed by name were listed)`),
    `expected the header-only over-cap notice; got: ${c9Out.slice(Math.max(0, c9Out.indexOf("(only the 50 most recent of 55")))}`
  );
});

/**
 * Characterization (docs/specs/git-log-base-named-merge.md, pre-refactor
 * safety net for the `Landing.branch` write-boundary refactor). These pin what
 * the three sites in that contract's refactor-scope do *today*, in the shapes
 * no existing check constrains — the measurable half of its Preservation
 * contract, "for every input whose merge subjects do not parse to the base's
 * name, output is byte-identical".
 *
 * Not E/M checks: those are the contract's own acceptance criteria for the new
 * behavior and are authored with the fix. Each check below earned its place by
 * mutation — its site was broken in the way the refactor could plausibly break
 * it, and the existing suite stayed green.
 */
console.log("characterization: the Landing.branch write boundary (pre-refactor safety net)");

const unpulledRepo = buildUnpulledCloneFixture();
const unpulledOut = await tryLoad([`${unpulledRepo} since:2024-01-01T00:00:00Z`]);

check("characterization — the landing walk follows the base's ref form, not its display form", () => {
  assert.ok(!unpulledOut.startsWith("<threw:"), `expected output; got: ${unpulledOut}`);
  const ahead = section(unpulledOut, "--- landed 2024-02-01 direct");
  assert.ok(
    ahead,
    `the landing only origin/main carries is missing — the walk followed the base's display form and reported a stale clone's local history instead; got: ${unpulledOut}`
  );
  assert.ok(
    hasSubject(ahead.body, "shipped while the clone was stale"),
    "the ahead landing's own commit is missing from its section"
  );
  // Premise, so the assertion above cannot pass by the walk failing outright:
  // the landing both forms share has to render too.
  assert.ok(
    section(unpulledOut, "--- landed 2024-01-01 direct"),
    `the landing both forms share is missing, so nothing walked at all; got: ${unpulledOut}`
  );
});

const writeBoundaryRepo = buildWriteBoundaryFixture();
const writeBoundaryOut = await tryLoad(
  [`${writeBoundaryRepo} since:2024-01-01T00:00:00Z`],
  "picked up feature/first and feature/second"
);

check("characterization — a merge-parsed name is not overwritten by a later path-1 candidate", () => {
  const s = section(writeBoundaryOut, "--- landed 2024-02-01 branch: feature/first");
  assert.ok(s, `the merge-parsed name did not reach the header; got: ${writeBoundaryOut}`);
  assert.ok(
    hasSubject(s.body, "first: the work"),
    "the landing's own commit is missing from its section"
  );
  assert.equal(
    countOf(writeBoundaryOut, "branch: feature/second"),
    0,
    `path 1 relabelled a landing that already carried a merge-parsed name; got: ${writeBoundaryOut}`
  );
});

check("characterization — a single-parent commit whose subject reads like a merge is not named by it", () => {
  const s = section(writeBoundaryOut, "--- landed 2024-03-01 direct");
  assert.ok(
    s,
    `the flattened pull-merge lost its 'direct' header — a name was parsed off a single-parent subject, and the selection then filtered the landing away entirely; got: ${writeBoundaryOut}`
  );
  assert.ok(
    hasSubject(s.body, "Merge branch 'feature/flattened'"),
    "the flattened commit's own record is missing from its section"
  );
  assert.equal(
    countOf(writeBoundaryOut, "branch: feature/flattened"),
    0,
    `a single-parent subject was read as a branch name; got: ${writeBoundaryOut}`
  );
});

/**
 * The rendered-name half of B11's fixture, which B11 itself leaves unasserted.
 * Measured now, before the refactor touches this assignment: the path-1 name
 * reaches the header in the ref's `display` form, which is what §Spec's
 * rendered-name rule calls for. (B11's comment records the ref spelling
 * reaching the header instead, and an escalation over it; that no longer
 * reproduces.) Dropping `displayOf` from the path-1 assignment leaves every
 * existing check green — B11's counts do not move, and its
 * `includes("feature/dual")` filter matches `origin/feature/dual` just as
 * readily.
 *
 * Both of B11's paste orders are asserted, but they do not differ here and are
 * not expected to: `mentionsName`'s token bound rules the display form out of
 * this landing's message (`origin/feature/dual` is one ref-charset token, so
 * the `feature/dual` inside it is not a match), leaving the ref spelling as
 * the only candidate path 1 can act on either way. The loop pins that
 * coincidence rather than assuming it.
 */
check("characterization — a path-1 name renders in the ref's display form, not the pasted ref spelling", () => {
  for (const [label, out] of [
    ["display form first", dualDisplayFirst],
    ["ref form first", dualRefFirst],
  ]) {
    assert.ok(
      section(out, "--- landed 2024-01-03 branch: feature/dual"),
      `${label}: expected the path-1 name folded to the ref's display form; got: ${out}`
    );
    assert.equal(
      countOf(out, "branch: origin/feature/dual"),
      0,
      `${label}: the pasted ref spelling reached the header instead of the ref's display form; got: ${out}`
    );
  }
});

/**
 * docs/specs/git-log-base-named-merge.md (deferred-followups item 13). A merge
 * subject can parse to the base's own name, and until this contract that name
 * went straight into `Landing.branch` — so every render path reported the base
 * as a branch that landed on itself. The rule now lives at the two write sites
 * (`landingName`), which is why no check below reaches for a guard on a read.
 *
 * A landing whose only name was unusable is nameless in full, window and cap
 * priority included, so the fix moves membership in two directions. E6 pins
 * the one where a landing disappears and E7 the one where it appears; neither
 * is a side effect discovered afterwards.
 */
console.log("base-named merge parses (E1-E7)");

const WIDE = "since:2024-01-01T00:00:00Z";
const FORK_MERGE_HEADER = "--- landed 2024-03-01 merge: Merge pull request #5 from someuser/main";

const e1Out = await tryLoad([`${baseNamedMergeRepo} branches:* ${WIDE}`]);
const e2Out = await tryLoad([`${baseNamedMergeRepo} ${WIDE}`]);
// One spec serves E4 and E7: `feature/*` matches the branch the second merge's
// body names and never the base, which is exactly both criteria's premise.
const narrowGlobOut = await tryLoad([`${baseNamedMergeRepo} branches:feature/* ${WIDE}`]);

const remoteBaseNamedRepo = buildBaseNamedMergeFixture({ unpulledRemote: true });
const e3Out = await tryLoad([`${remoteBaseNamedRepo} branches:* ${WIDE}`]);
// `origin/main` is the base's ref spelling *and* a slash-bearing token, so it
// is the one candidate a memo can carry that selects the base at all.
const UNPULLED_MEMO = "picked up origin/main today";
const e6NoWindow = await tryLoad([`${remoteBaseNamedRepo}`], UNPULLED_MEMO);
const e6Windowed = await tryLoad([`${remoteBaseNamedRepo} ${WIDE}`], UNPULLED_MEMO);

check("E1 — a merge parsing to the base's name renders as a nameless merge section (glob, wide window)", () => {
  assert.equal(
    countOf(e1Out, "branch: main"),
    0,
    `the base was named as a branch; got: ${e1Out}`
  );
  const s = section(e1Out, FORK_MERGE_HEADER);
  assert.ok(s, `the landing lost its section instead of losing its name; got: ${e1Out}`);
  assert.ok(hasSubject(s.body, "some fork work"), "the landing rendered without its commits");
});

check("E2 — the same with no selection at all: the no-selection path, which has no hit filter to guard", () => {
  assert.equal(countOf(e2Out, "branch: main"), 0, `the base was named as a branch; got: ${e2Out}`);
  const s = section(e2Out, FORK_MERGE_HEADER);
  assert.ok(s, `the landing lost its section instead of losing its name; got: ${e2Out}`);
  assert.ok(hasSubject(s.body, "some fork work"), "the landing rendered without its commits");
  // No selection means no path 1, so the second merge is nameless here too —
  // the arm that proves this check is not passing through a selection filter.
  assert.ok(
    section(e2Out, "--- landed 2024-04-01 merge: Merge pull request #6 from someuser/main"),
    `the second base-naming merge is missing; got: ${e2Out}`
  );
});

check("E3 — both of the base's spellings are rejected, display form and ref form", () => {
  assert.equal(countOf(e3Out, "branch: main"), 0, `the display form named the base; got: ${e3Out}`);
  assert.equal(
    countOf(e3Out, "branch: origin/main"),
    0,
    `the ref form named the base; got: ${e3Out}`
  );
  // Positively asserted, or a window that renders nothing would pass the two
  // counts above for the wrong reason.
  const display = section(e3Out, FORK_MERGE_HEADER);
  assert.ok(display, `the display-form merge did not render; got: ${e3Out}`);
  assert.ok(hasSubject(display.body, "some fork work"), "the display-form landing lost its commits");
  const ref = section(e3Out, "--- landed 2024-05-01 merge: Merge branch 'origin/main'");
  assert.ok(ref, `the ref-form merge did not render; got: ${e3Out}`);
  assert.ok(hasSubject(ref.body, "more fork work"), "the ref-form landing lost its commits");
});

check("E4 — a base-naming merge whose body names a selected branch is reported under that branch", () => {
  const s = section(narrowGlobOut, "--- landed 2024-04-01 branch: feature/x");
  assert.ok(
    s,
    `path 1 did not name the landing its merge-parse no longer claims; got: ${narrowGlobOut}`
  );
  assert.ok(hasSubject(s.body, "second fork work"), "the named landing rendered without its commits");
  assert.equal(
    countOf(narrowGlobOut, "--- confirmed landed on"),
    0,
    `feature/x took a paths-2/3 section on top of its own landing; got: ${narrowGlobOut}`
  );
});

check("E5 — preservation: a merge subject naming anything but the base still yields that name", () => {
  // The mutation anchor for `landingName` — a helper that always returned null
  // would take this with it. E4 is the same anchor on the other write site.
  assert.ok(
    section(noSelection, MERGED_HEADER),
    `an ordinary merge lost its parsed name; got: ${noSelection}`
  );
});

check("E6 — the disappearance direction: a nameless landing takes the nameless window", () => {
  // Premise: the memo's `origin/main` really is what selected here, or the
  // absence below would just be the no-selection default doing its usual work.
  assert.ok(
    e6NoWindow.includes("branches named in the memo"),
    `the memo selected nothing, so this repository never reached the named window; got: ${e6NoWindow}`
  );
  assert.equal(
    countOf(e6NoWindow, "Merge pull request #5"),
    0,
    `a 2024 landing survived the 7-day nameless bound; got: ${e6NoWindow}`
  );
  // The needle above only exists in the nameless render form, so on its own it
  // is green even when the landing survives under a false `branch: main`
  // header. The landing's own commit subject is carried by either form.
  assert.equal(
    countOf(e6NoWindow, "some fork work"),
    0,
    `the landing survived the nameless bound under some other header; got: ${e6NoWindow}`
  );
  // The other half, or the first passes for the wrong reason: with a window
  // that covers it, the same landing renders — and renders nameless.
  const s = section(e6Windowed, FORK_MERGE_HEADER);
  assert.ok(s, `the landing is absent even under a window covering it; got: ${e6Windowed}`);
  assert.ok(hasSubject(s.body, "some fork work"), "the landing rendered without its commits");
  assert.equal(
    countOf(e6Windowed, "branch: main"),
    0,
    `the base was named as a branch; got: ${e6Windowed}`
  );
});

check("E7 — the appearance direction: a selection that never matches the base no longer withholds it", () => {
  const s = section(narrowGlobOut, FORK_MERGE_HEADER);
  assert.ok(
    s,
    `the landing is still filtered out by a name it could never satisfy; got: ${narrowGlobOut}`
  );
  assert.ok(hasSubject(s.body, "some fork work"), "the landing rendered without its commits");
  assert.equal(
    countOf(narrowGlobOut, "branch: main"),
    0,
    `the base was named as a branch; got: ${narrowGlobOut}`
  );
});

// F1's and F2's outputs are loaded here rather than beside their own checks so
// that they can join M1's table: git-log-base-guard-pinning §Invariants keeps
// the sweep as the pin for the base-naming rule and adds these two inputs to it
// rather than replacing it. They are its most exotic inputs — a display
// collision across three remotes, and a glob spelled in the base's ref form —
// and `check()` runs at its call site, so a block below M1 could not feed it.
const displayCollisionRepo = buildDisplayCollisionFixture();
const collisionOut = await tryLoad(
  [`${displayCollisionRepo} since:2024-01-01T00:00:00Z`],
  "picked up upstream/main"
);
const globRepo = buildBaseRefGlobFixture();
// The base's ref spelling, windowed over both merges *and* the direct commit
// between them. The glob repository goes first: loadGitLog throws for the whole
// spec list rather than one spec, so a throw here takes the second repository's
// output with it — which is the blast radius item 18 is about.
const globTwoSpecs = await tryLoad([
  `${globRepo} branches:origin/main since:2024-02-01`,
  `${repo} ${WINDOW}`,
]);

check("M1 — no header names the base as a branch, in any mode or window", () => {
  for (const [label, out] of [
    ["glob, wide", e1Out],
    ["no selection", e2Out],
    ["narrow glob", narrowGlobOut],
    ["remote base, glob", e3Out],
    ["pasted base spelling, no window", e6NoWindow],
    ["pasted base spelling, wide", e6Windowed],
    ["glob, no window", baseNamedMergeOut],
    ["display collision, pasted", collisionOut],
    ["base ref glob, two specs", globTwoSpecs],
  ]) {
    // A `<threw: …>` output yields zero sections below, letting a fixture
    // that starts throwing pass this check while contributing no assertions
    // at all — item 22's finding. Asserted on the throw itself, not on
    // `sections(out).length`: "pasted base spelling, no window" legitimately
    // renders zero sections by design (E6's disappearance direction), so a
    // bare length check would misfire on a correct, non-throwing result.
    assert.ok(!out.startsWith("<threw:"), `${label}: threw instead of rendering: ${out}`);
    for (const header of sections(out).map((s) => s.header)) {
      // The `(landed <date>)` suffix is optional, not decorative: M1 covers
      // *both* header forms, and the name-confirmed one ends in that suffix
      // rather than in the name (confirmedHeader). Anchored at the name alone,
      // this regex sees `--- landed <date> branch: main` and is blind to
      // `--- confirmed landed on main branch: main (landed <date>)` — the one
      // form the `glob, no window` entry above can actually produce, since
      // there rendering is windowed out and `namedSelected` is not. The anchor
      // itself stays: without it `branch: mainline` would trip this.
      assert.ok(
        !/branch: (?:main|origin\/main)(?: \(landed [^)]+\))?$/.test(
          header
        ),
        `${label}: a header named the base as a branch: ${header}`
      );
    }
  }
});

// One of the three "Beyond E1–E7" checks — see docs/specs/git-log-base-named-merge.md's
// section of that name for why these exist and what each pins; not restated
// here to avoid a second copy of that derivation drifting from the first.
console.log("a base-naming merge takes the nameless cap priority too");

const CROWD_FORK_HEADER = "--- landed 2024-09-01 merge: Merge pull request #5 from someuser/main";
const crowdedBaseNamedOut = await tryLoad([
  `${buildBaseNamedMergeCrowdedFixture(MAX_BRANCHES)} branches:* ${WIDE}`,
]);
// Same shape, same spec, same window — only the crowd differs.
const roomyBaseNamedOut = await tryLoad([
  `${buildBaseNamedMergeCrowdedFixture(3)} branches:* ${WIDE}`,
]);

check("cap priority — a landing left nameless by landingName loses its slot to the named ones", () => {
  // The roomy half first, or the absence below could be the window's doing or
  // the name filter's rather than the cap's.
  const s = section(roomyBaseNamedOut, CROWD_FORK_HEADER);
  assert.ok(
    s,
    `the base-naming merge did not render even with cap slots to spare; got: ${roomyBaseNamedOut}`
  );
  assert.ok(hasSubject(s.body, "some fork work"), "the landing rendered without its commits");

  // Crowded: it was in `selected` — the notice counts it, base commit included
  // — and lost its slot to MAX_BRANCHES named landings, every one of them
  // older than it.
  assert.ok(
    crowdedBaseNamedOut.includes(
      `(only the ${MAX_BRANCHES} most recent of ${MAX_BRANCHES + 2} landings were rendered)`
    ),
    "the cap did not truncate the expected set, so this repository never tested the priority"
  );
  assert.ok(
    !section(crowdedBaseNamedOut, CROWD_FORK_HEADER),
    "a landing with no name kept a cap slot the named landings had already filled"
  );
  assert.equal(
    countOf(crowdedBaseNamedOut, "some fork work"),
    0,
    "the evicted landing's commits rendered anyway"
  );
});

// Another of the three "Beyond E1–E7" checks — see docs/specs/git-log-base-named-merge.md's
// section of that name.
console.log("the base is not confirmed by name where its landing is windowed out either");

// Ends before either base-naming merge: both stay in `judged`, which the
// header-only path reads unwindowed, while nothing renders them.
const HEADER_ONLY = "since:2024-01-01T00:00:00Z until:2024-02-01";
const headerOnlyBase = await tryLoad([`${remoteBaseNamedRepo} ${HEADER_ONLY}`], UNPULLED_MEMO);
// The same window shape over a branch that is not the base, as a guard on the
// shape itself: a window that reached the header-only path not at all would
// leave the absences above passing for the wrong reason. It trails them
// deliberately — it is the weaker claim, and the pre-fix run must report the
// base naming itself rather than this.
const headerOnlyNamed = await tryLoad([`${baseNamedMergeRepo} ${HEADER_ONLY}`], "wrapped up feature/x");

check("the windowed-out header-only path confirms a real branch, and the base in neither spelling", () => {
  // Premise, as in E6: the memo's `origin/main` is what selected here, or the
  // base was never a name this path could have confirmed.
  assert.ok(
    headerOnlyBase.includes("branches named in the memo"),
    `the memo selected nothing; got: ${headerOnlyBase}`
  );
  assert.ok(
    section(headerOnlyBase, "--- landed 2024-01-01 direct"),
    `the spec rendered nothing at all, so it never reached a header; got: ${headerOnlyBase}`
  );
  assert.equal(
    countOf(headerOnlyBase, "branch: main"),
    0,
    `the base confirmed itself by name, display form; got: ${headerOnlyBase}`
  );
  assert.equal(
    countOf(headerOnlyBase, "branch: origin/main"),
    0,
    `the base confirmed itself by name, ref form; got: ${headerOnlyBase}`
  );
  assert.ok(
    headerOnlyNamed.includes("--- confirmed landed on main branch: feature/x (landed 2024-04-01)"),
    `this window never reached the header-only path, so the absences above prove nothing; got: ${headerOnlyNamed}`
  );
});

// The last of the three "Beyond E1–E7" checks — see docs/specs/git-log-base-named-merge.md's
// section of that name.
console.log("a base-naming merge that path 1 renames takes the named arm's window");

const pastedPath1Out = await tryLoad([`${baseNamedMergeRepo}`], "wrapped up feature/x");

check("path 1 names a base-naming merge from a pasted candidate, and the named arm bounds it by nothing", () => {
  const s = section(pastedPath1Out, "--- landed 2024-04-01 branch: feature/x");
  assert.ok(
    s,
    `the landing is absent though the named arm takes no default window; got: ${pastedPath1Out}`
  );
  assert.ok(hasSubject(s.body, "second fork work"), "the named landing rendered without its commits");
  assert.equal(
    countOf(pastedPath1Out, "--- confirmed landed on"),
    0,
    `feature/x took a header-only section instead of its own landing; got: ${pastedPath1Out}`
  );
});

/**
 * docs/specs/git-log-base-guard-pinning.md — the two edges git-log-base-named-merge
 * left unpinned. F1 holds the path-1 write guard, which rejects a real input
 * that no other check in this file produces; F3 and F5 are the preservation
 * halves of the gate change F2 and F4 make (the error path narrows and pasted
 * mode does not move), and both are green before it as well as after. F6 holds
 * the widened question's own bound — the parent count that keeps it asking
 * about exactly the landings the merge-parse write site could have named — and
 * F7 the arm beside it that was already there, a glob matched by a landing's own
 * name once its ref is gone.
 *
 * F1's and F2's outputs are loaded above, beside M1, so they also feed that
 * sweep; every other load here is local.
 */
console.log("base-naming edges (F1-F7)");

check("F1 — a pasted candidate displayOf folds onto the base's own name names nothing", () => {
  // Premise: `upstream/main` is what selected here, or path 1 never ran and
  // the two absences below would hold for a reason this check does not test.
  assert.ok(
    collisionOut.includes("branches named in the memo"),
    `the memo selected nothing, so the write guard was never reached; got: ${collisionOut}`
  );
  // Asserted positively, or a spec that rendered nothing passes the counts.
  const s = section(collisionOut, "--- landed 2024-09-01 direct");
  assert.ok(s, `the landing lost its section instead of losing its name; got: ${collisionOut}`);
  assert.ok(
    hasSubject(s.body, "hotfix from upstream/main applied"),
    "the landing rendered without its own commit"
  );
  assert.equal(
    countOf(collisionOut, "branch: main"),
    0,
    `the guard let the base's display form name a landing; got: ${collisionOut}`
  );
  assert.equal(
    countOf(collisionOut, "branch: origin/main"),
    0,
    `the guard let the base's ref form name a landing; got: ${collisionOut}`
  );
});

const globNothing = await tryLoad([`${globRepo} branches:nosuchbranch* since:2024-02-01`]);
const globDefaultWindow = await tryLoad([`${globRepo} branches:origin/main`]);
const globPastedBaseRef = await tryLoad(
  [`${globRepo} since:2024-01-01T00:00:00Z`],
  "picked up origin/main"
);

check("F2 — a glob a base-naming merge matched renders the repository as a selection", () => {
  assert.ok(
    !globTwoSpecs.startsWith("<threw:"),
    `the glob matched a landing whose name was unusable and the callout died; got: ${globTwoSpecs}`
  );
  assert.ok(
    section(globTwoSpecs, MERGED_HEADER),
    `the other repository in the callout lost its output; got: ${globTwoSpecs}`
  );
  const merge = section(globTwoSpecs, "--- landed 2024-03-01 merge: Merge branch 'origin/main'");
  assert.ok(merge, `the landing the glob matched did not render; got: ${globTwoSpecs}`);
  assert.ok(hasSubject(merge.body, "work from the mirror"), "the landing rendered without its commits");
  const direct = section(globTwoSpecs, "--- landed 2024-04-01 direct");
  assert.ok(direct, `the base's own direct landing did not render; got: ${globTwoSpecs}`);
  assert.ok(
    hasSubject(direct.body, "hotfix straight on the base"),
    "the direct landing rendered without its commit"
  );
  assert.equal(
    countOf(globTwoSpecs, "branch: main"),
    0,
    `a header named the base's display form; got: ${globTwoSpecs}`
  );
  assert.equal(
    countOf(globTwoSpecs, "branch: origin/main"),
    0,
    `a header named the base's ref form; got: ${globTwoSpecs}`
  );
  // The two below are what a gate widened at the throw alone cannot satisfy:
  // it survives the spec and then falls through to the no-selection path,
  // which has no note and filters nothing.
  assert.ok(
    globTwoSpecs.includes(", branches origin/main)"),
    `the repository fell out of selection mode; got: ${globTwoSpecs.split("\n")[0]}`
  );
  assert.equal(
    countOf(globTwoSpecs, "branch: feature/x"),
    0,
    `a landing the glob does not match rendered; got: ${globTwoSpecs}`
  );
});

check("F3 — a glob matching no name the repository carries still raises git.no-branches", () => {
  assert.equal(
    globNothing,
    `<threw: ${t("git.no-branches", { glob: "nosuchbranch*", path: globRepo })}>`
  );
});

check("F4 — the same glob with no window renders an empty window, it does not throw", () => {
  // The default spelling of the fixed callout: a bare `branches:` takes the
  // 7-day default while the gate reads the windowless `judged`, so this is the
  // input a user is most likely to write and the one the trade is stated on.
  assert.ok(
    !globDefaultWindow.startsWith("<threw:"),
    `the default spelling still raises an error; got: ${globDefaultWindow}`
  );
  assert.ok(
    globDefaultWindow.includes("(no commits in this window)"),
    `expected the ordinary empty-window section; got: ${globDefaultWindow}`
  );
});

check("F5 — pasted-candidate mode is untouched: the base's ref spelling still takes the no-selection path", () => {
  // The only check in this file that can see an unscoped widening: the memo's
  // `origin/main` is a candidate the base-naming merge's parsed subject
  // matches, so a widened question not scoped to `spec.branches` puts this
  // repository into selection mode — where the note appears and the landing
  // the selection cannot match is filtered out. Every other check agrees
  // between the two implementations, F1's included (its paste selects a real
  // branch, so `selectedBranches` is never empty there).
  assert.equal(
    countOf(globPastedBaseRef, "branches named in the memo"),
    0,
    `the pasted base spelling put the repository into selection mode; got: ${globPastedBaseRef}`
  );
  const s = section(globPastedBaseRef, "--- landed 2024-05-01 branch: feature/x");
  assert.ok(
    s,
    `the no-selection path's landings were filtered by a selection; got: ${globPastedBaseRef}`
  );
  assert.ok(hasSubject(s.body, "work on the feature"), "the landing rendered without its commits");
});

/**
 * §Invariants' other half: *the error path narrows, never widens*. F3 holds the
 * "no name at all" direction; this holds the bound on the one exception. The
 * widening asks about exactly the landings the merge-parse write site could
 * have named, which is what `parents.length >= 2` is doing in it — a
 * single-parent commit whose subject still reads `Merge branch '<x>'` is never
 * read as a name (enumerateLandings' parent-count test, pinned by the
 * write-boundary characterization above), so nothing about it matched the glob
 * and `git.no-branches` remains the true answer.
 *
 * buildWriteBoundaryFixture already carries the shape and is reused unchanged:
 * a flattened pull-merge dated 2024-03-01, single-parent, subject
 * `Merge branch 'feature/flattened'`, with no ref of that name in the
 * repository. Its landing is nameless, so it is the exact input that reaches
 * the widened disjunct and must be rejected by it.
 *
 * Mutation-verified: dropping `l.parents.length >= 2` turns this check red and
 * no other — the same reason F5 exists for the scoping.
 */
const globFlattenedSubject = await tryLoad([
  `${writeBoundaryRepo} branches:feature/flattened since:2024-01-01T00:00:00Z`,
]);

check("F6 — a glob matched only by a single-parent merge-shaped subject still raises git.no-branches", () => {
  assert.equal(
    globFlattenedSubject,
    `<threw: ${t("git.no-branches", { glob: "feature/flattened", path: writeBoundaryRepo })}>`
  );
});

/**
 * §Invariants' narrowing rule read in its other direction: the error path must
 * not *widen* either, and the gate change rewrote the disjunct that holds one
 * whole arm of it. `judged.some((l) => match(l.branch))` is what spares a glob
 * whose only match is a landing the merge-parse write site already named — the
 * ordinary "merged, then deleted the branch" flow, where no ref carries the name
 * any more and `selectedBranches` therefore comes back empty. Losing it turns
 * that input into `git.no-branches`.
 *
 * Nothing in this file exercised that arm in *glob* mode. A13 and B1 reach the
 * same disjunct from pasted mode — A13 with a name the merge-parse write site
 * set, B1 with one path 1 assigned — but pasted mode has no throw for them to
 * observe: the gate reads `spec.branches && !matched`, so there the disjunct
 * only decides selection against fall-through. In glob mode `names` is drawn
 * from `selectedBranches`, so with none selected path 1 cannot run and the
 * landing's own merge-parsed name is the only thing left that can match — and
 * losing the disjunct there turns the input into an error instead. That is the
 * one (glob × no selected branch × matched) cell the gate has, and it was the
 * only cell of the table with no check behind it.
 *
 * buildDefaultWindowFixture already carries the shape and is reused unchanged:
 * `feature/deleted` is merged --no-ff at 2024-07-09 and its ref deleted straight
 * after, so the name survives on the landing and no branch scan can return it.
 * `feature/old` is the same shape with its ref intact, which is what makes the
 * last assertion able to tell a selection from a fall-through.
 *
 * Mutation-verified: scoping the disjunct to pasted mode (`!spec.branches &&
 * judged.some((l) => match(l.branch))`) turns this check red and no other — the
 * same reason F5 exists for the widened arm's scoping.
 */
const globDeletedBranch = await tryLoad([`${win} branches:feature/deleted since:2024-01-01T00:00:00Z`]);

check("F7 — a glob whose only match is a landing whose ref is gone selects, it does not throw", () => {
  assert.ok(
    !globDeletedBranch.startsWith("<threw:"),
    `a glob matched only by a named landing raised an error; got: ${globDeletedBranch}`
  );
  // Asserted positively, or a spec that rendered nothing passes the count below.
  const s = section(globDeletedBranch, "--- landed 2024-07-09 branch: feature/deleted");
  assert.ok(s, `the landing the glob matched did not render; got: ${globDeletedBranch}`);
  assert.ok(hasSubject(s.body, "deleted: work"), "the landing rendered without its commits");
  assert.ok(
    globDeletedBranch.includes(", branches feature/deleted)"),
    `the repository fell out of selection mode; got: ${globDeletedBranch.split("\n")[0]}`
  );
  assert.equal(
    countOf(globDeletedBranch, "branch: feature/old"),
    0,
    `a landing the glob does not match rendered; got: ${globDeletedBranch}`
  );
});
