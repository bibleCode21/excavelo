---
status: confirmed
ceremony: standard
approved-commit: ddd71b41cbeec6d4c496514c184e3e9ce9fdce80
---
# `[!git]`: the base-naming rule's two unpinned edges — a live guard no test holds, and a glob that now takes the callout down

## §Why

- **Goal** — close deferred-followups items 15 and 18, and item 17's first bullet. All three are consequences of `git-log-base-named-merge` moving the "never the base's own name" rule to `Landing.branch`'s write sites, and all three are about the *edges* that move left behind rather than about the rule itself, which holds.

  1. **Item 15 — a load-bearing guard with no net and a contract that denies it.** `loadGitLog`'s path-1 write guard (`landingName(base, displayOf(name))`) rejects a real input: with the base resolved to `origin/main` and a third remote whose `upstream/main` carries the newest tip, `enumerateBranches`' display dedup yields `{display:"main", ref:"upstream/main"}`, so a pasted `upstream/main` clears `namesBase` and comes back out of `displayOf` as the base's own display name. Measured both ways — the guard present renders `--- landed 2024-09-01 direct`, the guard replaced by a bare `displayOf(name)` renders `--- landed 2024-09-01 branch: main`, an M1 violation. **All 175 existing probe checks pass under that mutation**, so nothing but a comment holds the guard, and `git-log-base-named-merge.md` §Spec states the opposite ("Today `names` is already base-filtered so this rejects nothing"). A reader who trusts the contract over the comment deletes the guard and reopens the exact defect that unit closed.

  2. **Item 18 — the rule's rejection widened an error path into a callout-wide failure.** The glob gate asks `!judged.some((l) => match(l.branch))`, and `l.branch` is now `null` for a landing whose merge subject parsed to the base. Where the glob is spelled in the base's *ref* form in a repository whose display dedup dropped that ref from the branch list, both disjuncts go false and `loadGitLog` throws `git.no-branches`. Measured: at `5f82ec9` the same input rendered `--- landed 2024-03-01 branch: origin/main` **and** `--- landed 2024-01-01 direct`; at `66a667d` it renders nothing at all. Removing the false header is the fix working; losing the base's own legitimate landing is not, and because `loadGitLog` throws for the whole spec list rather than one spec, every other repository in the same callout loses its output too. The glob did match a name this repository carries — the name was merely unusable, which is a different fact from "nothing matched".

  3. **Item 17's first bullet — a filter described as load-bearing that no longer bears.** `names`' base exclusion (`git-log.ts:1021`, `:1027`) is output-neutral now that the write-site helper catches the same case downstream: removing it leaves all 175 checks green, and `landingsNaming` keys its map per name, so an added base entry cannot alter another name's match. The filter is worth keeping — it narrows the predicate's input rather than duplicating a check on the same object — but the comment above it defends a failure mode the helper closed, and `git-log-base-named-merge.md` §Non-goals calls it "load-bearing". The claim is what is wrong, not the code.

- **Non-goals** — the base-naming rule itself and its home at the two write sites; `landingName`, `namesBase`, `displayOf` and `enumerateBranches`' display dedup, all of which behave correctly and are the reason items 15 and 18 exist at all. The `eligible` exclusion in `loadConfirmedSections` keeps both its behavior and its "load-bearing" description, which remains true — it decides which candidates are matched at all, and no downstream helper repeats it. `names`' filter is **not deleted**: output-neutrality is not a reason to remove an input narrowing, and the prior contract's §Non-goals decided to leave it. `git.no-branches`' i18n key and English wording are unchanged. The remaining item 17 bullets (B12 wording breadth, contract↔probe duplication, the two opposed comments at `:879`/`:367`, `landingName`'s name, contract §26's branded-type premise, probe file size, the `assigned` set) are a separate unit — this one takes only the bullet the checkpoint routed here. `docs/architecture.md` is untouched, per the `git-log-marker-reserved-vocab` precedent for bug-fix contracts.

- **Editing the prior contract is deliberately out of scope.** `docs/specs/git-log-base-named-merge.md` carries the two superseded sentences, and the temptation is to fix them there. This contract does not, for two reasons: editing a confirmed contract voids its confirmation and forces a re-pin cycle on a unit that is already merged and closed, and a work contract records what one unit decided rather than what later turned out to be true. The correction lives where cross-unit corrections already live — an appended `docs/prd.md` decision row, the same channel the 07-28 and 07-29 rows used to qualify each other — plus this contract, which names both superseded sentences verbatim so a reader arriving at either can find the correction.

- **Success criteria**
  1. The path-1 write guard has a check that fails when the guard is removed. Mutation-verified: `landingName(base, displayOf(name))` → `displayOf(name)` turns it red, and it is the *only* input shape in the probe that does so.
  2. A `branches:<glob>` spelled in the base's ref form renders the repository **as a selection** instead of throwing — note present, non-matching branches still filtered — and a second repository in the same callout keeps its output. The false `branch: <base>` header stays gone. This holds for the windowed spelling and for the bare one that takes the 7-day default.
  3. A glob that genuinely matches nothing still raises `git.no-branches`. The fix narrows one error path; it does not remove the error. Pasted-candidate mode is untouched in every input.
  4. Every existing check in `scripts/probe-git-log.mjs` passes unchanged.
  5. No comment or contract sentence in the allowed surface still asserts that the path-1 guard rejects nothing, or that `names`' base exclusion is load-bearing.

- **Preservation contract** — output is byte-identical for every input except the one §Spec's gate change names: a `branches:<glob>` that today raises `git.no-branches` while a base-naming merge matched it. Because the widened question is scoped to `spec.branches`, **pasted-candidate mode is byte-identical without exception**. That claim carries its own check — **F5**, not the existing net: an unscoped widening leaves all 175 checks green, and E6 cannot see it either (E6's fixture lists the base as `{display:"main", ref:"origin/main"}`, so `selectBranches` selects it and the gate is never reached). Every existing probe fixture is unaffected, including `buildBaseNamedMergeFixture` and `buildRemoteBaseFixture`; the 175 checks are the net for everything else and all must stay green. The two new fixtures are additive. The `git.no-branches` error keeps its key, its wording, and every input that legitimately reaches it — criterion 3 is that preservation stated as a check rather than an intention.

- **Refactor rationale** — none. Item 18 is a behavior fix to one conditional and items 15 and 17 are a check plus comment and document corrections; nothing is restructured, so `refactor-scope` is empty and the surgical default stands.

## §Spec

### The gate's question

"This glob selected nothing that exists" and "this glob selected something whose name was not usable" are different facts. Only the first is an error.

A landing whose merge subject parses to a name the glob matches has matched the glob, whether or not that parsed name survived `landingName`. The question the code asks in two places — *did anything match?* — is therefore widened once, to include a judged landing that is a merge whose parsed subject the glob matches but whose `Landing.branch` the base-naming rule left `null`. The parse is re-read where the question is asked rather than stored: storing the discarded name would give `Landing.branch` a second, weaker source of truth, which is the shape the prior unit removed.

**Both sites take the widened question, not one.** `git-log.ts` asks it at the throw (`:1097`) and again, one line later, to decide whether the repository is in selection mode at all (`:1103`). Widening only the throw is a distinct and wrong implementation: the spec would survive but fall through to the no-selection path, dropping the `, branches <glob>` note and — because nothing filters any more — rendering landings from branches the glob does not match. The selection must stay a selection; the change decides whether the spec renders, never what it renders.

**The widening is scoped to `spec.branches`.** Pasted-candidate mode has no gate and must stay byte-identical: a pasted `origin/main` against a base-naming merge falls through to the plain path today, and `git-log-base-named-merge` §Spec's disappearance direction (its E6) pins that. Only the glob arm changes.

Such a landing renders exactly as `git-log-base-named-merge` §Spec already requires: nameless, as `--- landed <date> merge: <subject>`, under the nameless window and cap priority. The change grants no landing a name.

### Observable behavior

- A `[!git]` callout whose glob is spelled in the base's ref form, in a repository where that ref lost the display dedup and a base-naming merge is the only match, renders that repository in **selection mode** — the `, branches <glob>` note present, landings from non-matching branches still filtered out, the merge itself a nameless `merge:` section, and the base's own landings as they always rendered. Other repositories in the same callout are unaffected because nothing throws.
- **When the window excludes that merge, the spec renders its ordinary empty-window section rather than throwing.** This is the *default* spelling of the fixed callout — a glob with no `since:`/`until:` takes the 7-day default while the gate reads the windowless `judged` — so it is named here rather than discovered. The trade is deliberate and is an accuracy gain, not merely a smaller failure: something did match the glob, so `git.no-branches` ("No branches match …") would state a falsehood, while the empty-window notice states exactly what happened. The callout-wide throw is what this unit is removing, and it is no more acceptable on the default spelling than on the windowed one.
- A glob matching no name the repository carries, in any form, still raises `git.no-branches` with its existing key and wording.
- Pasted-candidate mode is unchanged in every input.
- No other input changes. In particular a glob that matches a real branch reaches the gate with `selectedBranches` non-empty and never evaluates the widened question.

### Acceptance criteria

Extending `scripts/probe-git-log.mjs`. Two fixtures are added; no existing fixture is touched.

`buildDisplayCollisionFixture` — base resolved to `origin/main` through `origin/HEAD`, with `origin/main` containing the landing (the first-parent walk runs on `base.ref`, so a landing outside it is not a landing); a squash-shaped landing on it whose message names `upstream/main`; and a third remote `upstream/main` whose tip is newer than every other ref, so `for-each-ref --sort=-committerdate` lists it first and it claims the display name `main`.

`buildBaseRefGlobFixture` — base resolved to `origin/main` through `origin/HEAD`, containing, in commit order: a root commit; a two-parent merge whose subject is `Merge branch 'origin/main'`; **a direct commit on the base**, so the fixture has a direct landing that F2's window can cover without reaching back to the root commit; and an ordinary `Merge branch 'feature/x'` landing, which `branches:origin/main` must **not** select and which is what separates the candidate implementations of this change. Plus a local `main` one commit **ahead**, so display dedup keeps `{display:"main", ref:"main"}` and drops `origin/main` from the branch list, and a `feature/x` ref so F3's glob has something real to fail against.

- **F1** — item 15's guard, pinned. With a memo pasting `upstream/main` and a window covering the landing, the landing renders **positively** — its `direct` header and its commit are both asserted, so the check cannot pass by rendering nothing — and no header names the base in either spelling. Mutation-verified: replacing `landingName(base, displayOf(name))` with `displayOf(name)` turns F1 red, and turns no other check red.
- **F2** — item 18's gate: it does not throw, and the spec stays a selection. `loadGitLog` is called with **two** specs: `buildBaseRefGlobFixture` under `branches:origin/main` with a window covering both merges **and the direct commit between them**, and any existing fixture under an ordinary spec. All of the following are asserted, and the last two are what make the check able to fail against the throw-only implementation:
  - it does not throw, and the second spec's output is present — the blast-radius half, without which the callout-wide cost goes unpinned;
  - the base-naming merge renders as `--- landed <date> merge: Merge branch 'origin/main'`, and the base's own direct landing renders;
  - no header names the base in either spelling;
  - the repository header carries the `, branches origin/main` note;
  - **no `feature/x` landing appears** — the glob does not match it, and a spec that fell through to the no-selection path would render it.

  Mutation-verified twice: restoring the gate to its current form turns F2 red, and widening only the throw while leaving `:1103` unchanged also turns F2 red.
- **F3** — preservation of the error. In the same fixture, `branches:nosuchbranch*` still raises `git.no-branches`, asserted on the i18n key rather than the English wording. Mutation-verified: a gate that never throws turns F3 red.
- **F4** — the default spelling. The same fixture under a bare `branches:origin/main` with no `since:`/`until:`: `loadGitLog` does not throw, and the output is the ordinary empty-window section for that repository rather than an error. This is the input §Spec's second Observable-behavior bullet names, and the one a user is most likely to write. Mutation-verified: restoring the gate to its current form turns F4 red.
- **F5** — the scoping, pinned rather than asserted. The same fixture with a memo pasting `origin/main`, **no glob**, and a window covering the `feature/x` landing (without one the plain path takes `DEFAULT_SINCE` and the 2024-dated fixture renders nothing, leaving the landing assertion red against correct code): the spec takes the plain path — no `, branches named in the memo` note, and the `--- landed <date> branch: feature/x` landing present — exactly as it does today. This is the only check in the probe that can see the difference, because F1's pasted fixture selects `upstream/main` and so leaves `selectedBranches` non-empty, while F2–F4 are glob-mode where the two implementations agree. Mutation-verified: widening the question **without** the `spec.branches` scope turns F5 red and turns nothing else red — including all 175 existing checks, which is why prose alone would not have held it.

### Invariants

- **M1 holds unchanged.** No rendered header names the base as a branch, in any selection mode, under any window, whatever assigned the name. The existing `M1` sweep is the pin; F1 and F2 add two inputs to it rather than replacing it, and the gate change grants no name.
- **The error path narrows, never widens.** Every input that raises `git.no-branches` today still raises it, except one: a glob matched by a base-naming merge's parsed subject.

- allowed-surface:
  - `src/core/git-log.ts` — the glob gate and the selection-mode decision beside it, with their comments; the comments above the path-1 write guard and above `names`' base exclusion, to the extent they assert something this contract corrects.
  - `scripts/probe-git-log.mjs` — F1–F5 and the two fixtures they need.
  - `docs/prd.md` — one appended decision row qualifying the 2026-07-29 row. Append-only.
  - `CHANGELOG.md` — one `### Fixed` entry under `[Unreleased]`, stating that a callout which failed now renders.
  - `docs/specs/git-log-base-guard-pinning.md` — this contract.
  - *(The binding unit of this list is the **path**. The prose after each dash describes intent and is not a closed enumeration: a check or fixture that this contract's §Spec and §Invariants imply is inside the surface even where the sentence did not name it. Deferred item 16 records why this qualifier is written out — the deciding unit is still open.)*
- refactor-scope:
  - (none)
