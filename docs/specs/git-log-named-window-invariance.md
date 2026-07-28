---
status: draft
ceremony: standard
---
# `[!git]`: a confirmed branch is reported by name whatever the window does

## §Why

- **Goal** — close the false negative `git-log-landed-confirmation` left behind: a selected branch whose landing *carries its name* is reported nowhere when the rendering window does not cover that landing. The landed section is filtered out by the window, and the confirmed-section scan excludes the branch precisely *because* a landing named it — so the branch is silent, and B6 makes silence mean "nothing confirms this". The feature's first question is "which of these branches actually landed", and today the answer for those branches is indistinguishable from "none of them".

  Measured on `e070886`, three shapes, all reproduced end-to-end through the real module:
  - `branches:feature/*` with no `since:`/`until:` — the 7-day default applies to named landings too, so **every** branch that landed more than a week ago vanishes. (`verify-vanish.mjs`; the landing there is a merge, so the name is merge-parsed.)
  - pasted names + an explicit `since:` — a documented, ordinary input combination. (`verify-path1only.mjs`.)
  - pasting `origin/feature/x` while the landing is merge-parsed as `feature/x` — **no window involved**: `hit` is built from the pasted spelling and never learns the ref's display form, so the landing is filtered out, and the same name then excludes the branch from the confirmed scan.

- **Non-goals** — the landed predicate itself (all three paths, their bounds, the exclusions, the accepted third-party-message threat), the 7-day default in either mode, `escapeMarkerLines` and the reserved-marker vocabulary (deferred item 11 owns that), `MAX_COMMITS`/`GIT_TIMEOUT_MS`, `parseGitSpec`, per-commit rendering, error contracts, the no-selection mode. No new git call, no new dependency. **The rejected fall-through must not be reintroduced**: "when a path-1 confirmation does not render, fall through to paths 2/3" was measured false — a path-1-only branch fails both (`verify-path1only.mjs`), so it would leave exactly the branches this contract exists for still silent.

- **Success criteria**
  1. A selected branch that any landing names appears by name in the output, in every mode and under every window — bounded only by the per-kind cap in §Bounds, which announces its own truncation.
  2. The window still governs *rendering*: an out-of-window landing contributes no commits, no diffstat, no date block.
  3. Narrowing `since:`/`until:` never removes a branch name from the output — bounded, like criterion 1, only by the per-kind cap in §Bounds, which announces its own truncation. It may only change that name's carrier — from a full `--- landed <date> branch: <name>` section to a header-only confirmed section.
  4. No branch is reported twice, and no branch that nothing confirms is reported at all.

- **Preservation contract** — measured, not asserted: with the change applied in a scratch worktree, `node scripts/probe-git-log.mjs` (132 checks at `e070886`) moves **exactly one**. Everything else — A1–A16, I1–I4, B1–B7, B9–B20, J1–J4 and every unnumbered check, including `probe:1224` named below — passes unchanged and must keep doing so.

  | criterion | what changes |
  |---|---|
  | **B8, first half** ("narrowing the window leaves the confirmed set identical") | its comparison set grows: a named landing the narrow window drops now produces a header-only confirmed section, which the old assertion reads as a changed confirmed set. Restated below as C3, over the *stronger* set the criterion was reaching for — every branch name in the output, not just the confirmed-section headers. B8's second half (the narrowing demonstrably reaches the rendering) survives verbatim and is what keeps C3 from holding vacuously. |

  One documented sentence is falsified and must move with the code — it appears in four places (`src/core/prompt.ts:64`, `starter-templates/work-log.md:81`, `starter-templates/work-report.md:46`, `docs/templates-format.md:113`): *"when it carries no lines at all, its commits appear among the `--- landed` sections instead."* Under this contract a header-only section also occurs when the landing is outside the window, and then the commits are in the log **nowhere**. Left as-is, the model is told to look for commits that do not exist.

  `README.md` / `README.ko.md` are deliberately **not** edited: they already claim "Branches you pasted are matched however old their landing is" / "붙여넣은 브랜치는 반영 시점이 아무리 오래됐어도 찾아냅니다". That claim is false today under an explicit window and true once this lands — this work makes the documentation accurate rather than the reverse.

- **Refactor rationale** — none. Two mechanical consequences of the change, not refactors of anything around them: the confirmed header string moves into one helper because two call sites now emit it, and `loadLandingSections` returns the landings it rendered alongside its sections because the caller must now distinguish "handed to the renderer" from "actually emitted" (see §Which names take the header-only form).

## §Spec

### The semantics being inserted

**A named confirmation is window-invariant.** A landing that names a selected branch confirms it, and the window has no vote in that. The window decides only how the confirmation is *carried*:

| the naming landing | how the branch is reported |
|---|---|
| renders | `--- landed <date> branch: <name>` with its commits — unchanged |
| does not render | `--- confirmed landed on <base> branch: <name> (landed <date>)` — header only, subject to the §Bounds cap |

"Names it" covers both sources a name has, exactly as `landingHeader` already treats them as one: parsed off a merge subject (`parseMergeBranchName`), or assigned by path 1. The primary reproduction is a merge-parsed name, so excluding that source would leave the measured defect open.

The date is the landing's committer date — the same value a `--- landed <date>` header carries. It is what lets the model place the work relative to the reported period instead of guessing; a report that says "landed, when unknown" invites work from outside the window into "## Completed". When two named landings match one branch, the newest one's date is reported (the walk is newest-first).

**The dateless header-only form is unchanged and still means what it meant**: path 3 (ancestry) identifies no single landing, so it carries no date. The suffix is present exactly when a single landing is identified.

### Selection folds a branch's two spellings

A landing whose name equals the `display` **or** the `ref` of a selected branch is a selected landing, whichever spelling did the selecting. Today `test` sees only the raw memo token or glob, and path 1's `assigned` set covers only the names path 1 itself assigned — a merge-parsed name is matched against the pasted spelling alone. `selectBranches` already accepts a branch by either form; this is the same rule applied where the *landing's* name is matched, and it is the root cause of the third measured shape (no window involved). With it, that landing renders in full under the ref's `display` name; the header-only form is not reached at all while the window covers it.

### Which names take the header-only form

A landing takes the header-only form when it **has a name, is selected by the rule above, and was not actually rendered** — "rendered" meaning a section `loadLandingSections` emitted, not membership in the list handed to it. Selection is what keeps this derivation inside the selection modes, where confirmation exists at all; the no-selection mode drops landings by window and cap exactly the same way and confirms nothing, as §Non-goals keeps it.

Three things stop a landing short of a section: the window, the `MAX_BRANCHES` slice, and an empty body. Deriving from the input list instead would leave the last two reporting nothing at all, and then *widening* a window could remove a branch name from the output — the inverse of criterion 3, and not the case the cap qualifier covers, since nothing was truncated and no notice fires. The landing-side over-cap notice does not rescue the slice case either: it names no branch.

Deduplicated by lower-cased name; a branch with one landing rendered and another not is already reported and takes no second section.

**"Reported by name" = rendered ∪ header-only, and that set — together with whatever the §Bounds cap truncated off its tail — is what excludes a branch from the paths-2/3 scan.** One derivation feeding both is the whole point — today's two derivations disagree, and that disagreement is the defect. The rendered half of that exclusion already has a net, `probe:1224` ("a branch named by its own merge landing gets no second, confirmed section"): it must stay green, since dropping the rendered half would double-report every ordinary merge (its ref is an ancestor, so path 3 would confirm what the landed section already named). C6 covers the header-only half.

Name-confirmed header-only sections are emitted before the paths-2/3 sections, newest landing first.

### Bounds

No new git process, in any mode: every input is already in memory (`judged`, the rendered landings, `selectedBranches`).

**The header-only kind is capped at `MAX_BRANCHES` (50), newest landing first**, with its own notice — `(only the <N> most recent of <M> branches confirmed by name were listed)`, where `<M>` counts this kind's own candidates (the branches whose naming landing did not render), as both existing notices count within their own kind — fired only when the list was truncated, never merely because the cap number was reached. This is the predecessor's "each section kind is capped independently" rule applied to the kind this contract adds, and it is load-bearing rather than defensive: in `branches:<glob>` mode with no window, *every* named landing in the whole history reaches this set (the 7-day default bounds rendering, not the predicate), which on the measured repository — 2414 landings — is a several-hundred-line block, the same prompt bloat the predecessor closed for nameless landings. Branches past the cap are excluded from the paths-2/3 scan as well: the cap bounds work and output alike, as the predecessor's branch-side cap does.

The paths-2/3 scan's denominator — `eligible`, the branches that reach its own `MAX_BRANCHES` slice — is unchanged in size for every selected branch that no landing names, and *shrinks* by exactly the branches a landing names, which is what the exclusion always meant to do.

### Acceptance criteria

Extending `scripts/probe-git-log.mjs`. Fixtures, stated because the wrong one pins the wrong thing:

- C1 uses the **main** fixture (`buildFixture`): `feature/merged` is merge-parsed (`Merge branch 'feature/merged'`), has a live ref, and its landing is dated 2024-07-10 — outside any live `DEFAULT_SINCE`. The confirmation fixture cannot serve here: every landing in it is single-parent by construction (`probe:1937`), so it carries no merge-parsed name at all.
- C2 needs the `verify-path1only.mjs` shape — a branch with a live ref that is **not** an ancestor and whose base-unique subject resolves against no landing, plus a landing that mentions it by name. No existing fixture has one; the branches in the confirmation fixture that path 1 confirms are ref-less.
- C4 needs a branch that exists **only** as `refs/remotes/origin/feature/<x>` whose landing is `Merge branch 'feature/<x>'`. `buildRemoteTrackingFixture`'s landing deliberately names nothing and `buildDualNameFixture`'s is a squash, so neither can be reused without breaking what they pin.
- C8/C9 reuse the repository A11 already builds — `buildManyLandingsFixture(MAX_BRANCHES + 5)` = **55** named merge landings with live refs, all dated 2024 (`probe:1493`). The helper writes to a fixed path and throws on a second call, so C8/C9 share that one repository and their numbers are 55 confirmed / 50 listed / 5 truncated; A11's own load is untouched.

- **C1.** `branches:<glob>` with no spec window: a branch whose **merge-parsed** landing predates `DEFAULT_SINCE` is reported as `--- confirmed landed on <base> branch: <name> (landed <date>)`, the date matching that landing's own, while no commits of it render — `verify-vanish.mjs`'s shape.
- **C2.** Pasted mode with an explicit `since:` past every landing: the same, against a branch **paths 2 and 3 both fail**. This is the fixture that proves the rejected fall-through would not have closed this.
- **C3.** The set of branch names appearing in **any** header is identical wide vs narrow — B8's first half over the stronger set, on a fixture under the caps. Asserted together with B8's surviving second half, or it holds vacuously.
- **C4.** Pasting only `origin/feature/x` for a landing merge-parsed as `feature/x` renders that landing in full under `feature/x` — no header-only form, no silence. Narrowing the window over the same fixture moves it to C1's form.
- **C5.** The `(landed <date>)` suffix appears **only** on the name-confirmed form: a path-2 section (subject list) and a path-3 section (ancestry, header alone) keep the dateless header. B14's header-only assertion is exact and must stay exact.
- **C6.** A name-confirmed branch gets exactly one section — no paths-2/3 section for the same branch (J1) — and the header-only form is parsed as its own section while not being a member of `landedSections` (B15's two halves, over the new shape).
- **C7.** `buildPrompt`, both starter templates and `docs/templates-format.md` state that a header-only confirmed section means the commits are among the `--- landed` sections **or are not in this log at all**, and describe the date suffix. The clause must cover every reason §Spec gives — the window, a truncated section list, an empty body — not the window alone: a cap-evicted landing's commits are in-window and absent, so "outside the window" would be false for a case this contract creates. String assertions on B9's precedent (`starter-templates.ts` and `probe-transform-preservation.mjs`'s rule-array copy).
- **C8.** A named landing that the landing-side cap evicts still reports its branch by name, header-only — the criterion the input-list derivation would fail. Pinned with a window wide enough that all 55 landings are eligible: 50 render, the remaining 5 are named by header-only sections.
- **C9.** The header-only kind's own cap: the same fixture in glob mode with no window confirms 55 branches by name, lists 50, and says so in the notice; the 5 it truncated get no paths-2/3 section either (each ref is an ancestor, so path 3 would otherwise confirm them). The notice stays absent when nothing was truncated.

### Invariants

- **K1.** For any spec, changing only `since:`/`until:` changes no branch name in the output — the name set is a function of the predicate alone, up to a cap that announces its own truncation. (C3 is its observable; the window governs rendering only, which is the predecessor's own rule finally holding for the named side too.)

### Verification

`node scripts/probe-git-log.mjs` (all 132 existing checks plus C1–C9; already wired into CI) and `node scripts/probe-transform-preservation.mjs`. Of the three preserved reproductions in `checkpoints/git-log-landed-repros/`, the two this contract must **flip** are `verify-vanish.mjs` and `verify-path1only.mjs` (each must end up reporting the branch by name); the third, `verify-base.mjs`, pins the opposite property — the base must not name itself — and must keep printing its `ok` line, since B12/B18 are preserved, not changed. The third measured shape has no repro of its own; C4 is its pin. All three are throwaways and are not shipped.

- allowed-surface:
  - `src/core/git-log.ts` — the spelling fold in `loadGitLog`'s `match`, the rendered/name-confirmed derivation and its cap, `loadLandingSections`'s rendered-landing return, the shared confirmed-header helper and its date suffix, and the file-header comment's account of what a selection reports.
  - `src/core/prompt.ts` — the git label rule's falsified clause.
  - `scripts/probe-transform-preservation.mjs` — holds a verbatim copy of prompt.ts's git rules and asserts them by exact string; the prompt.ts change cannot land without it.
  - `starter-templates/work-log.md`, `starter-templates/work-report.md` — the same clause, and the date suffix.
  - `src/core/starter-templates.ts` — generated by the prebuild hook; never hand-edited.
  - `scripts/probe-git-log.mjs` — C1–C9, B8's first half restated, the fixtures named above.
  - `docs/templates-format.md` — the `[!git]` label table entry for the confirmed label.
  - `docs/architecture.md` — the `git-log.ts` row's contract pointer list, which a third governing contract makes incomplete. The row's prose stays true.
  - `docs/prd.md` — one appended row qualifying the 2026-07-27 row. Append-only.
  - `CHANGELOG.md` — the `[Unreleased]` entry, which describes this predicate and is not yet released.
  - `docs/specs/git-log-named-window-invariance.md` — this contract.
- refactor-scope:
  - (none — surgical; §8 default applies)
