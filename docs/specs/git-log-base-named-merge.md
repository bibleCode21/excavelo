---
status: confirmed
ceremony: standard
approved-commit: 20643b0bc544db93217a9735e16746da84562783
---
# `[!git]`: a landing never carries the base's own name, whatever named it

## §Why

- **Goal** — close deferred-followups item 13: a merge subject can *parse* to the base's own name (`Merge pull request #5 from someuser/main` is an ordinary shape whenever a contributor's fork also defaults to `main`), and `enumerateLandings` stores that parse in `Landing.branch` without asking whether the name is the base. Every render path then reports it: `--- landed <date> branch: main` — the base ref named as a branch that landed on itself, which B12 forbids.

  Item 13's recorded first action was a `!namesBase(base, l.branch)` guard on `loadGitLog`'s `selected` array. Grounding measured that this closes only half the defect: the same output is produced with **no selection mode at all** (`[!git] <path> since:2024-01-01`, where `hit` is null and rendering runs through the plain path), which no guard on `selected` can reach. Reproduced against `buildBaseNamedMergeFixture` in both modes before this contract was written.

  The deeper finding is structural, and it is why this contract opens a refactor scope rather than adding a third guard. `Landing.branch` has **two write sites** (the merge-parse in `enumerateLandings`, the path-1 assignment in `loadGitLog`) and **five or more read sites** (`selected`, `namedSelected`, `namedAlready`, `renderedNames`, the plain-mode render). The "never the base" rule currently lives on the *reads*, scattered — so every new read is a new chance to omit it. That is not hypothetical: the previous unit's full panel found exactly this omission in `namedSelected`, and item 13 is the same omission in `selected`. Two independent occurrences of one mistake is a structure, not an accident. This contract moves the rule to the write boundary, where the count is two and does not grow.

- **Non-goals** — the landed predicate's three confirmation paths, the window/cap/nameless-default rules, `MAX_BRANCHES`/`MAX_COMMITS`/`GIT_TIMEOUT_MS`, `globMatch`, `parseGitSpec`, `escapeMarkerLines` and the reserved-marker vocabulary (deferred item 14 owns that). The base exclusions on **selection candidates** — `names` in `loadGitLog` and `eligible` in `loadConfirmedSections` — stay exactly as they are: those decide which *candidate names are matched at all* (B12's path-1/2/3 arms), a different question from what a landing may be called, and they remain load-bearing. `judged`'s in-place mutation is not removed: making `Landing.branch` readonly and deriving path-1 names as a separate map would redesign `loadGitLog`'s flow and every consumer of it, which item 13 does not license. `starter-templates/work-log.md` keeps its current wording ("a landing header may carry no branch name … that is normal"), which stays true under this change and costs transform tokens to extend. `src/core/prompt.ts` is untouched, so `scripts/probe-transform-preservation.mjs` is too. No `docs/architecture.md` update: its `git-log.ts` row states nothing this contract falsifies, and a bug-fix contract is not listed among its architectural contract pointers (`git-log-marker-reserved-vocab` precedent).

- **Success criteria**
  1. No rendered header names the base as a branch, in any selection mode and under any window — including the plain, no-selection path that has no `hit` at all.
  2. A landing whose merge subject parses to the base's name is never dropped *because* its name was rejected: it renders, with its commits, under `--- landed <date> merge: <subject>`, on exactly the terms every other nameless landing already gets. The defect is a wrong label, not an unwanted landing. What that costs is stated, not hidden — such a landing becomes nameless in the full sense, window and cap priority included, and §Spec pins all three directions in which its membership can change.
  3. The rule has exactly one home. After this change every write to `Landing.branch` passes through it and no read re-checks it — the now-provably-dead read guard in `namedSelected` is removed rather than left as a second, weaker copy.
  4. Every existing check in `scripts/probe-git-log.mjs` passes unchanged.

- **Preservation contract** — output is unchanged for every repository whose merge subjects parse to something other than the base, which is every existing fixture in the probe except `buildBaseNamedMergeFixture`. That fixture's existing B12 assertion (no `branch: main` in the header-only, no-window mode) keeps passing; what changes is the wide-window and plain-mode output it was documented as *not* covering. For a repository that *does* carry such a merge, the change is not label-only — §Spec's two membership directions are the full statement of it, and E6/E7 are their pins. The two candidate-side base exclusions (`names`, `eligible`) keep their current behavior and their current checks, including B18's two-form coverage.

- **Refactor rationale** — the one-line fix at the construction site would leave the path-1 write site correct only *by accident* (its safety comes from `names` being base-filtered upstream, an unrelated rule that a future change may narrow) and would leave a dead guard sitting on one of five reads, where the next new read is unguarded again — the shape that produced this defect twice. Routing both writes through one helper and deleting the dead read is what makes "reads may trust `Landing.branch`" a statement the code actually supports. TypeScript cannot restrict the field to one writer without a class or module boundary, which a 1200-line file does not warrant; the helper plus a stated invariant on the interface is the honest ceiling, and it is named as such in the code.

## §Spec

### The rule and its home

A name is usable for a landing only when it does not name the base, in either of the base's two forms (`namesBase`'s existing display/ref test, unchanged). One private helper in `src/core/git-log.ts` decides this and returns the usable name or `null`; its doc comment states that the invariant is enforced here and trusted at every read, and the `Landing.branch` doc comment carries the same one-line statement.

Both write sites call it:

- `enumerateLandings` — `parseMergeBranchName`'s result passes through the helper before it becomes `Landing.branch`. The function takes the base as a `BranchRef` rather than a bare ref string (both forms are needed; its single caller already holds one).
- `loadGitLog`'s path-1 assignment — `displayOf(name)` passes through the helper before assignment. Today `names` is already base-filtered so this rejects nothing; the point is that the guarantee stops depending on that.

No read re-checks. `namedSelected`'s `!namesBase(base, l.branch)` is removed, its comment replaced by a pointer to the rule's home.

### Observable behavior

A merge whose subject parses to the base's name is a landing with **no name**: it renders as `--- landed <date> merge: <subject>` with its commits, exactly as a merge whose subject matches no known format does, and it becomes eligible for a path-1 name assignment on the same terms as any other nameless landing. Where its message uniquely names a selected branch, that landing is reported under that branch's name and the branch takes no paths-2/3 section — path 1's ordinary outcome, reached because the merge-parsed name was discarded as unusable rather than because anything about path 1 changed.

Nameless is meant in full, not as a label change. Under a selection such a landing moves from the named arm of `loadGitLog`'s `selected` list to the nameless one, and so takes the **nameless window** and the **nameless cap priority** (named landings are placed first precisely so the cap cannot evict a selected branch's landing; a landing with no name is not entitled to that protection). This is the correct reading of the fix — a landing whose only name was unusable is nameless, and nameless landings already have a stated bound — but it moves membership in three directions, all of which §Spec pins rather than discovers later — the two window directions below, and the cap direction the same sentence commits to, pinned by the `cap priority` check under "Beyond E1–E7":

- **It can disappear.** In pasted-candidate mode with no explicit `since:`/`until:`, the named arm has no window at all while the nameless arm takes `DEFAULT_SINCE`. A base-naming merge older than that is therefore absent where it previously rendered under a false `branch: <base>` header. This is reachable without contrivance: `enumerateBranches` dedups by display keeping the newer tip, so a repository whose `origin/main` is ahead of its local `main` — an unpulled clone — lists the base as `origin/main`, and a memo carrying that spelling selects the base. The trade is deliberate: a false attribution is removed, and what remains follows the nameless bound every other unnamed landing follows. In glob mode the two arms always share one window, so no landing disappears there.
- **It can appear.** Under a selection that does not match the base (`branches:feature/*`, or any pasted candidate set without the base's spelling), such a landing was previously excluded by the name filter it could never satisfy. As a nameless landing it now renders inside the window like every other nameless landing — real work that was being withheld.

### Acceptance criteria

Extending `scripts/probe-git-log.mjs`. `buildBaseNamedMergeFixture` is reused and grows into the shape these criteria jointly force:

- **Two** base-naming merges, not one. The first carries no branch mention in its body and is what E1, E2, E6 and E7 assert on; the second's body uniquely names `feature/x` and is E4's. One merge cannot serve both — under this contract the second becomes path-1-assignable, so a single merge would render as `branch: feature/x` exactly where E7 requires a nameless `merge:` section. Every check that asserts on one must identify which.
- A `feature/x` ref, so a narrow glob has something to select that is not the base.
- An optional remote-base arm: `origin/HEAD`, an `origin/main` whose tip is **ahead of the local `main`**, and a third merge subject in the base's *ref* spelling (`Merge branch 'origin/main'`). This one arm carries both shapes E3 needs and the unpulled-clone shape that makes the base selectable from a pasted candidate in E6.

`buildRemoteBaseFixture` is not touched, since it pins B18.

- **E1.** `branches:*` with a window wide enough to cover the merge: no header names the base, and the landing renders as `--- landed <date> merge: Merge pull request #5 from someuser/main` with its commits present. Item 13's own reproduction.
- **E2.** The same repository with no selection at all (`<path> since:<wide>`, `hit` null): identically no base-named header, landing still rendered. The half a guard on `selected` cannot reach.
- **E3.** In a clone-shaped repository whose base resolves to `origin/main` while a local `main` exists, **both** spellings are rejected: under a window wide enough to cover them (E1's condition, without which the 2024 fixture dates render nothing and a negative-only assertion passes vacuously), a landing merge-parsed as `main` (the base's display form) and one merge-parsed as `origin/main` (its ref form) each render — positively asserted, with their commits — and neither carries a branch name. The only check that exercises why `namesBase` tests two forms.
- **E4.** With a window wide enough to cover the merge (E1's condition), a base-naming merge whose body uniquely names a selected `feature/x` renders as `--- landed <date> branch: feature/x`, and `feature/x` gets no `--- confirmed landed on` section.
- **E5.** Preservation, mutation-verified: an ordinary `Merge branch 'feature/merged'` still renders `branch: feature/merged`; replacing the helper with one that always returns `null` turns this check red, and reverting the helper to pass its candidate through unchanged turns E1–E3 red.
- **E6.** The disappearance direction, pinned deliberately rather than discovered: in the unpulled-clone arm, a memo carrying `origin/main` with **no** `since:`/`until:` selects the base, and the base-naming merge — older than `DEFAULT_SINCE` — appears nowhere in the output, under no header. The same spec with an explicit window covering it renders it as `--- landed <date> merge: <subject>`. Both halves are asserted, or the first passes for the wrong reason. The absence half needs a needle the *named* render form also carries — the merge subject is not one, since a landing surviving under a false `branch: <base>` header prints its name in place of its subject and leaves that needle green.
- **E7.** The appearance direction: `branches:feature/*` (which matches a branch in the fixture but not the base) with a window covering the merge renders it as a nameless `--- landed <date> merge: <subject>` section, where the same spec produces no section for it today.

**Beyond E1–E7.** The E series was derived from the defect's own reproduction, and so reaches only the shapes that reproduce it. These four checks come from §Invariants M1 and from the "nameless in full" paragraph above — sentences this contract already binds itself to, whose coverage the E enumeration omitted. They are named, not numbered, because they pin the statements rather than the reproduction. Each is mutation-verified against a `landingName` that passes its candidate through unchanged.

- **`M1`** — the invariant swept in one loop, rather than at the single point each E check occupies, over a closed set of seven outputs: `branches:*` under a wide window, under none, and in its narrow `feature/*` form; the plain no-selection path; the remote-base arm under a glob; and the pasted base spelling both with a window and without. No header in any of them may end in the base's name, in either spelling.
- **`cap priority`** — the third membership direction. E6 and E7 pin the two *window* directions; §Spec also gives such a landing the nameless **cap** priority, and `selected` places named landings first precisely so the cap cannot evict them. Needs its own fixture, `buildBaseNamedMergeCrowdedFixture(namedCount)`, whose only variable is the size of the named crowd.
- **the windowed-out header-only path** — M1's second header form, `--- confirmed landed on <base> branch: <name>`, in the only shape that produces it. `namedSelected` — the read whose base guard this contract *deletes* — is windowless while rendering is windowed, so only a spec whose window excludes the landing reaches it; every E check renders its landings and therefore cannot. B12 alone backs that deletion today, in one mode and one spelling.
- **path 1 in pasted mode** — the mirror of E6 for the "becomes eligible for a path-1 name assignment" sentence, which E4 pins in glob mode only. The pasted arm is where the window consequence inverts: its *named* arm takes no window at all, so the same merge E6 loses to `DEFAULT_SINCE` renders here unbounded.

### Invariants

- **M1.** No header in any rendered output names the base as a branch — neither `--- landed <date> branch: <name>` nor `--- confirmed landed on <base> branch: <name>` — in any selection mode, under any window, whatever assigned the name. This is B12 widened from "a *candidate* naming the base ref" to "any name source", which is the gap item 13 occupied: B12's original wording bound the candidate paths, and a merge-parsed name is not a candidate.

- allowed-surface:
  - `src/core/git-log.ts` — the new helper, `enumerateLandings`'s signature and its `branch` assignment, `loadGitLog`'s path-1 assignment, `namedSelected`'s removed guard and its comment, the `Landing.branch` doc comment.
  - `scripts/probe-git-log.mjs` — E1–E7 and the four checks named under "Beyond E1–E7" (`M1`, `cap priority`, the windowed-out header-only path, path 1 in pasted mode); `buildBaseNamedMergeFixture`'s second base-naming merge, its `feature/x` ref and its remote-base arm; `buildBaseNamedMergeCrowdedFixture`, which the `cap priority` check needs and nothing else uses; and the stale comment above the existing B12 fixture call that records the wide-window case as deferred.
  - `docs/templates-format.md` — the `merge:` row of the label table ("a merge whose subject names no branch") now also covers a subject naming only the base.
  - `docs/prd.md` — one appended decision row qualifying the 2026-07-28 row. Append-only.
  - `CHANGELOG.md` — one `### Fixed` entry under `[Unreleased]`; the landing model that prints merge-parsed headers shipped in 1.4.3, so this is a user-visible correction, and the entry must state the disappearance direction §Spec pins, not only the corrected label.
  - `docs/specs/git-log-base-named-merge.md` — this contract.
- refactor-scope:
  - `src/core/git-log.ts` — three sites only, and only to relocate an existing rule: the two `Landing.branch` write sites (`enumerateLandings`'s merge-parse, `loadGitLog`'s path-1 assignment) route through the new helper, and `namedSelected`'s read-side guard is deleted. Behavioral equivalence obligation: for every input whose merge subjects do not parse to the base's name, output is byte-identical.
