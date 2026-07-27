---
status: confirmed
ceremony: standard
approved-commit: 5b738320dbdf8f6860eef9387c1846d6f7b3fd8b
---
# `[!git]`: confirm which pasted branches actually landed

## §Why

- **Goal** — make a branch selection report *which of the selected branches actually reached the base*, by name. `git-log-master-source` fixed **what** is sourced (the base's first-parent history) but left the squash residual open: in a squash/rebase repository every landing is nameless, so a selected branch name never appears in the output, and a squash-landed branch is still emitted under `--- not yet on <base>`. Measured against the user's own repository (`vntg-ngw-api`, base `origin/master`, 2026-07-27): the base carries **zero merge commits** across 2414 landings, none of the six pasted branch names appears anywhere in the 55,080-character output, and the pasted-mode walk has no window at all so the entire first-parent history is dumped. The user's standing requirement — *"work that has not been applied to master is not an update record; judging whether it actually reached master is what matters"* — is what this closes.
- **Non-goals** — the `[!git]` spec syntax, the desktop-only guard, git binary discovery, `globMatch` and `MAX_GLOB_LENGTH`, `branchCandidates` token rules, the error contract (`git.no-branches` included — its raise condition is restated below, not changed), `parseGitSpec`, per-commit rendering (`=== %h %ad %an` + subject + body + diffstat), and the **no-selection** mode's behavior in full. No new dependency, no test framework, no merge-strategy detection. **Tree-content containment is rejected as an evidence axis** and must not be reintroduced: measured, every branch keeps a nonzero diff against the base on shared files (`build.gradle`, `application.properties`, `ApprService.java`) long after landing, so it is a false-negative machine in an active repository.
- **Success criteria**
  1. A branch whose name appears in a landing's message is reported as landed **even when no ref for it exists** (deleted after merge, the ordinary squash flow).
  2. A branch with a ref, carrying at least one base-unique commit, whose every unresolved commit resolves against the landing history, is reported as landed.
  3. A branch that is an ancestor of the base is reported as landed by name, even though no range can recover which commits were its work.
  4. A selected branch that no path confirms appears **nowhere** in the output — no not-yet-landed section, no "unverifiable" marker. (User decision A, reaffirmed twice.)
  5. In a selection mode, nameless landings are bounded by a window instead of the whole first-parent history. Measured: 2414 landings → 11 in the 7-day default.
  6. A commit subject that recurs across the base's history cannot confirm a landing. Measured: `bug fixed` occurs as 184 separate landings in the user's repository.

- **Preservation contract** — `git-log-master-source`'s **A1, A3, A4, A5, A6, A7, A8, A10, A11, A12, A13, A14, A16 and I1, I3, I4 survive**, three of them with their scope made explicit below rather than changed. The following criteria **do not survive verbatim** — this is the complete enumeration, and any criterion not listed here is preserved as written:

  | criterion | what changes |
  |---|---|
  | **A2, second half** | a selected unlanded branch no longer appears under `--- not yet on <base>`; it appears nowhere. A2's first half (an unlanded branch is absent with no selection) survives. |
  | **I2** | vacuously true once no not-yet-landed section is emitted; restated as J4 (the string is absent). |
  | **A9** | `prompt.ts` must emit **both** git rules. The landed-wins rule loses its counterpart when not-yet-landed sections stop existing and is retired with it; A9 narrows to "emits the label vocabulary, including the new `--- confirmed landed on <base>` label, and exactly one `=== GIT LOG ===` block". |
  | **A15, both halves** | `work-log.md` loses its "never write a not-yet-landed section into the work log" instruction (nothing left to exclude); `work-report.md`'s "In progress / carried over" loses its GIT LOG source. |
  | **A8, "no section names this branch"** | a rebased-and-fast-forwarded branch now gets a **header-only** `--- confirmed landed on <base> branch: <name>` section via path 3, so `probe:819`'s `sections(pastedRebased).filter(s => s.header.includes("feature/rebased")).length === 0` must become 1. A8's *"exactly once"* half is what survives untouched: the branch's commits still render once, as `direct` landings (`countOf(…, "rebased: one") === 1` holds — a header-only section contributes no commit lines), and it still produces no not-yet-landed section. Deliberate: the Goal is to report which selected branches reached the base, and this is the one shape where git can prove it. |

  Three preserved-but-clarified points, stated because the draft reviewed in Round 1 left them ambiguous:
  - **A3 / A4** keep their rule — a nameless landing is never filtered by name — and gain a bound: under a selection, nameless landings are additionally limited to the window. Both fixtures set an explicit `since:`/`until:` spanning their landings, so both pass unchanged; what changes is only the pasted-mode `since = null` case, which is the measured 55k dump.
  - **A6 / A13** are not in tension and neither is narrowed: a **spec-supplied** `since:`/`until:` bounds every landing kind (A6), and the **default** window is what named landings never receive (A13). The new bound adds `DEFAULT_SINCE` for nameless landings only, and only when the spec supplied no window.
  - **A8's "exactly once" half** is preserved by the base-unique floor in path 2: a rebased-and-fast-forwarded branch has zero base-unique commits, so path 2 cannot confirm it vacuously and cannot re-render its commits. Path 3 confirms it by ancestry with a header only — see the table row above for the half that does change.

  **Unnumbered regression nets that lose their observable, and where they are re-anchored** (each asserts today on the `--- not yet on` string, which stops existing):
  - the four `selectBranches` display-vs-ref checks (`probe-git-log.mjs:639-684`, the net added by `dedup-branch-selection-matching`) — re-anchored onto the new `--- confirmed landed on <base> branch:` label, **with the fixture rebuilt**: in `buildRemoteTrackingFixture` today `main` sits at the root commit and the planted tip is its *child*, so no path confirms it and the re-anchored header would never appear. Rebuild it so the remote-tracking branch is confirmable by one path while keeping the display/ref divergence the net exists to separate. They must not be deleted.
  - the three base-ref cap checks (`probe-git-log.mjs:1085-1108`, `branches:*` glob) — **these cannot be re-anchored by swapping the label.** Their fixture (`buildManyUnlandedBranchesFixture`) builds 51 branches whose work is unlanded by construction, so under the new predicate none is confirmed, no section is emitted, and the cap has nothing to evict. The fixture must be **rebuilt with path-2-confirmable branches** so the over-cap notice and the base-ref exclusion regain an observable. The property itself is restated in §Spec ("the base can never occupy a cap slot"), but the net must not be quietly dropped.

  **Stated plainly rather than buried: this work removes the ability to report in-progress branch work from `[!git]`.** Unlanded work is out of scope by the user's decision; the templates must stop promising it.

- **Refactor rationale** — none. Path 1 extends the existing `landedNames`/`hit` mechanism (a landing may take its branch name from more than its merge subject) and reuses `loadLandingSections` unchanged. Path 2 is `loadNotLandedSections` inverted in place: same per-branch query, opposite verdict, different label. Path 3 is one added git call in that same loop.

## §Spec

### What "selected name" means in each mode

Both selection modes produce a set of **candidate names**, and the predicate below is identical for both — how a branch was selected has no bearing on whether it landed.

- **Pasted mode**: the memo's `branchCandidates` tokens, whether or not a ref exists for them.
- **`branches:<glob>` mode**: the `display` names of the refs `selectBranches` matched. A glob is not itself a name and is never matched against landing messages; it selects refs, and those refs' names enter the predicate. A glob-selected branch is therefore confirmable by either path (path 1 needs the name, which the ref supplies).

`git.no-branches` keeps the raise condition the prior contract set — the glob matches neither a branch ref nor a landing's name — with "a landing's name" now including names path 1 assigns.

### The landed predicate — three paths, evaluated in order, exclusive

A selected branch is **confirmed landed** when any path succeeds. They are tried 1 → 2 → 3 and stop at the first success — the order is by how much the section can say, not by how strong the evidence is (path 3 is proof but can name no commits).

**Path 1 — the name appears in a landing's message.** For each candidate name, `git log --first-parent -F -i --grep=<name> <base>`, run **without a window**. The branch is confirmed when the matching set, after the exclusions below, contains **exactly one** landing. Requires no branch ref: the name is a string, so a branch deleted after its squash landing is still confirmable. The matched landing is then labelled with that name and rendered by the existing `loadLandingSections` path — `--- landed <date> branch: <name>`, commits included.

> Rationale for the exactly-one bound: `branchCandidates` accepts any slash-bearing token, so a memo mentioning `src/core/git-log.ts` puts a *file path* through this query, and file paths recur across many commit messages. Requiring uniqueness rejects them. This also preserves A12.
>
> **The bound is uniqueness as a substring, not as a ref, and that costs a real shape:** `-F --grep` matches substrings, so `feature/n1` also matches landings naming `feature/n10` … `feature/n19`, and a name that is a prefix of a sibling's name is therefore not confirmable by path 1. Ticket-prefixed conventions — the measured repository's `0713-sr2607-00334-kjh0407` shape — make this reachable, not theoretical. Such a branch falls through to paths 2 and 3, which is the intended degradation: less signal, never a wrong name.

**One landing carries at most one name.** A landing that already has a name (parsed from its merge subject, or assigned by an earlier candidate) keeps it; a later candidate matching the same landing confirms nothing and emits nothing. Without this, pasting both `feature/x` and `origin/feature/x` — which the existing probe does deliberately — would render one landing under two headers and break I3.

**A landing named by path 1 leaves the nameless set.** It is a named landing from that point on: it renders through the named path and is not subject to the nameless window bound.

**Path 2 — every base-unique commit resolves against the landing history.** Requires a ref. Two conditions, both necessary:

1. **Base-unique floor.** `git log <base>...<branch> --right-only` (no `--cherry-pick`), windowless, yields **at least one** commit. A branch with none — a ref at or behind the base, a rebased-and-fast-forwarded branch (A8) — is not confirmable *by this path*; path 3 takes it up.
2. **Full resolution.** `git log <base>...<branch> --right-only --cherry-pick --pretty=%s`, windowless, yields the unresolved subjects. Each resolves when it occurs as a substring of **exactly one** landing's message, after the exclusions below. The branch is confirmed when the unresolved count reaches zero.

Output: `--- confirmed landed on <base> branch: <name>` followed by **the base-unique commit subjects from condition 1** (not the whole branch history), one per line — no bodies, no diffstats, since a confirmed branch's commits may also sit in the nameless dump and re-rendering them in full would duplicate. A section is emitted only when that list is non-empty, matching the existing "no body → no section" behavior.

**Path 3 — the branch is an ancestor of the base.** Requires a ref. `git merge-base --is-ancestor <branch.ref> <base>` exits 0. This is proof, not a heuristic — it is the check I1 states — and it is the only path that confirms a rebased-and-fast-forwarded branch, whose base-unique set is empty by construction. Tried last because it carries the least information: **the section is the header alone**, `--- confirmed landed on <base> branch: <name>` with no subject list.

> **Exit codes are an answer here, not a failure**, and this module has no precedent for that — every other git call treats non-zero as fatal (`git-log.ts:298, 416, 495-498` → `git.failed`), and `git-log.ts` contains no `merge-base` today. Exit **0** = confirmed, exit **1** = not an ancestor (a normal negative, never surfaced as an error), any other exit (128 = bad ref) keeps the existing `git.failed` contract, which §Non-goals preserves.

> **What a path-3 name claims, and what it does not.** Being an ancestor is a statement about the ref's *position*, not about authorship: a stale branch that was created at some point on the base's history and never committed to is an ancestor too, and path 3 will name it. That is accepted — the alternative (excluding refs whose tip equals the base) would exclude the fast-forward shape this path exists for, since A8's own fixture leaves `main` and the branch at the same commit. The base ref itself is excluded, by the predicate-wide rule below.

> Why no commits: once a branch is an ancestor, its own commits *are* base commits, and no range recovers which of them were its work — `<base>...<branch>` is empty and `merge-base` returns the branch tip itself. `--fork-point` depends on reflog and is unavailable for a remote-tracking ref. So the header-only form is the honest maximum here; the commits themselves still render as `direct` landings when the window covers them. The path-2 rule that an empty subject list suppresses the section applies to path 2 only.

**The base ref is excluded from the predicate entirely** — not just from path 2. `merge-base --is-ancestor <base> <base>` exits 0, so without a predicate-wide `b.ref !== base` the base would confirm itself through path 3; `branches:*` selects it and `origin/master` is a valid pasted candidate. This also keeps it out of every cap slot, as today.

**Which name is rendered.** The `<name>` in any section this contract adds is the matched ref's `display` when a ref exists, and the candidate token as pasted when none does (path 1 without a ref). This keeps the re-anchored display-vs-ref net meaningful: all four of its checks expect one identical display-form header regardless of which side matched. Path 2's and path 3's *queries* use `branch.ref`, as `git-log.ts:560` does today.

**Exclusions, applied to paths 1 and 2.** A landing whose subject begins with `Revert "` or `Reapply "` is not a match candidate. Revert exclusion prevents a reverted commit's own revert from confirming it; Reapply exclusion is what *keeps* re-landed work confirmable — measured, `add: 세아네트웍스: 연장근무 신청서 상신 시 휴일근무일자 필수 입력 검증 추가` matches 5 landings raw (original + 2 reverts + 2 reapplies) and would fail the exactly-one bound, but exactly 1 after exclusion.

**Everything else is hidden.** A selected branch that no path confirms — unresolved commits remaining, no ref and no name match, or a typo naming nothing — contributes no section of any kind.

**The predicate never sees the window.** All three paths, and the landing history they match against, are read with no `--since`/`--until`. A window applied to the predicate would let an old unlanded commit fall outside it and read as resolved. The window governs rendering only.

**Selection outcome is unchanged (A12).** Whether a repository is in a selection mode still depends on whether any candidate matched *something* there — a branch ref or a landing name — not on whether the predicate confirmed it. A candidate with a ref that neither path confirms keeps the repository in selection mode; a memo whose only slash-tokens are file paths still falls through to no-selection with the default window.

### Windowing

| landing kind | spec supplied `since:`/`until:` | spec supplied none |
|---|---|---|
| named (merge-parsed, or named by path 1) | bounded by it (A6) | unbounded — no default (A13) |
| nameless (`direct`) | bounded by it (A6) | bounded by `DEFAULT_SINCE` — **the new bound** |

Nameless landings stay in the output as the safety net for work neither path confirms — measured, `0713-sr2607-00334-kjh0407` is genuinely on the base but its two subjects were rewritten into one combined subject by the squash, so no text evidence reaches it. Bounding them turns the 55k dump into the ~11 landings a work log actually covers.

The repository header keeps reporting the window the *spec* set, so A13's `(all history` assertion survives; when the nameless default bound is additionally in force the header names it as a second clause.

### Section labels

```
--- landed <YYYY-MM-DD> branch: <name>     unchanged; now also produced by path 1
--- landed <YYYY-MM-DD> merge: <subject>   unchanged
--- landed <YYYY-MM-DD> direct             unchanged; window-bounded under a selection
--- confirmed landed on <base> branch: <name>        new — path 2 (subjects, no date) / path 3 (header alone)
--- not yet on <base> branch: <name>       REMOVED in selection modes
```

The new label carries no date because no single landing is identified: `--cherry-pick` reports patch equivalence without naming the equivalent commit, and an ancestor names no range at all. Labels stay hardcoded English, LLM-facing, no i18n — as the existing ones are.

**The label deliberately does not begin with `--- landed `.** That prefix is a *selector* in the probe (`landedSections`, `probe-git-log.mjs:484`, filters on `header.startsWith("--- landed ")`), so a label aliasing it would silently re-scope every count-based assertion over landed sections — A11's `landedSections(manyOut).length === 1` most directly, since that fixture's branches all carry refs and are all ancestors, and path 3 would therefore add a second section to a count that pins one. `confirmed landed` keeps the vocabulary and stays outside the selector.

**What a header-only section means to the model** (path 3): the branch reached the base, and its commits — if the window covers them — appear as `direct` landings, not here. `prompt.ts` and the templates must say this, or a section with no entries sits between `work-log.md`'s "one entry line per user-visible change" and `prompt.ts`'s "do not invent work that is not in the log".

### Bounds

`MAX_BRANCHES` (50) caps each section kind independently, as today. Path 1 costs one `git log` per candidate name, capped at `MAX_BRANCHES`; path 2 costs up to two per branch path 1 did not confirm (the floor query and the cherry-pick query); path 3 costs one `merge-base --is-ancestor` per branch neither confirmed. Landings are read twice per repository — once unwindowed for the predicate, once windowed to decide which nameless landings render — replacing the single read that today is unwindowed in pasted mode. `MAX_COMMITS` and `GIT_TIMEOUT_MS` keep their meaning per invocation.

Two over-cap notices survive, in the existing shape: the landing-side notice (`git-log.ts:523-527`) unchanged, and the branch-side notice (`git-log.ts:568-572`) repurposed to count confirmed branches instead of unlanded ones.

### Acceptance criteria

Extending `scripts/probe-git-log.mjs` and its fixture (new shapes: a squash landing whose message body carries the source branch name; a squash landing whose subject was rewritten; a branch deleted after landing; a landing subject that recurs).

- **B1.** A branch whose name appears in exactly one landing's **body** is reported under `--- landed <date> branch: <name>` with that landing's commits — including when no ref for it exists.
- **B2.** A candidate token appearing in two or more landings' messages confirms nothing and emits no section. Pinned with a file-path token (`src/core/git-log.ts`), A12's own shape.
- **B3.** A landing whose subject begins with `Revert "` or `Reapply "` is not a match candidate on paths 1 and 2: work landed once, reverted, and reapplied is still confirmed (exactly one non-excluded match), and a name appearing only inside a revert's subject confirms nothing.
- **B4.** A branch with a ref, at least one base-unique commit, and every unresolved subject occurring in exactly one landing message is reported under `--- confirmed landed on <base> branch: <name>`, followed by its **base-unique** commit subjects and no bodies or diffstats.
- **B5.** A branch carrying a commit subject that occurs in two or more landings is not confirmed by path 2 and emits nothing. Pinned with a recurring subject (the `bug fixed` shape, measured 184× in the real repository).
- **B6.** No output in any selection mode contains the string `--- not yet on`, including for a branch with genuinely unlanded commits, and including `branches:<glob>` mode.
- **B7.** Under a selection with no spec window, a nameless landing outside `DEFAULT_SINCE` is absent while a named landing outside it is present. With a spec window, both kinds are bounded by it (A6). A3, A4 and A13 continue to pass unchanged.
- **B8.** Narrowing `since:` does not change which branches are confirmed — only which landings render.
- **B9.** `buildPrompt` emits the label vocabulary including `--- confirmed landed on <base>`, emits no not-yet-landed instruction, and emits exactly one `=== GIT LOG ===` block; `work-log.md` and `work-report.md` carry no not-yet-landed wiring **and both name the new label** — the negative half alone would let the new section fall through every template selector. String assertions against the generated `starter-templates.ts` and against `probe-transform-preservation.mjs`'s rule-array copy, on A9/A15's precedent.
- **B10.** `branches:<glob>` mode confirms through all three paths using the matched refs' display names, and a glob matching neither a ref nor a landing name still raises `git.no-branches`.
- **B11.** Pasting both `feature/x` and `origin/feature/x` for one landing yields exactly one section for it, headed with the ref's `display` form (I3 held, and the rendered-name rule pinned).
- **B12.** A candidate naming the base ref itself is not confirmed and emits no section, by any path.
- **B13.** A branch whose name is a prefix of another landing's branch name is not confirmed by path 1 (its `--grep` matches more than one landing) and falls through to paths 2 and 3. Pinned against the existing `feature/n1` / `feature/n1<N>` fixture shape.
- **B14.** A rebased-and-fast-forwarded branch is confirmed by path 3 and emits a **header-only** `--- confirmed landed on <base> branch: <name>` section — no subject lines — while its commits still appear exactly once, as `direct` landings, and no not-yet-landed section exists (A8's substance).
- **B15.** The new label is **parsed as its own section and is not a member of `landedSections`** — both halves asserted. This requires the probe's `sections()` helper (`probe-git-log.mjs:475`) to gain the `--- confirmed landed on ` prefix while `landedSections`' filter (`:484`) keeps matching only `--- landed `. Without the parser half, an unrecognized header and its subject lines are swallowed into the preceding section's body and B15 would pass for the wrong reason; without the filter half, A11's count breaks. A11 passes unchanged on its own fixture, whose branches path 3 confirms.
- **B16.** `merge-base --is-ancestor` exiting 1 produces no section and no error; a bad ref (exit 128) still raises `git.failed`.

### Invariants

- **J1.** A branch name **sourced from the memo or a glob** appears in the output only through path 1, 2, or 3 — never from the selection alone. A merge-parsed name (A1's `parseMergeBranchName`) is unaffected and keeps its existing path.
- **J2.** Every commit **rendered with a hash** under a landed section is reachable from the base (`git merge-base --is-ancestor` exits 0) — I1 unchanged. Path-2 sections render subjects without hashes and path-3 sections render no body at all; both are covered by J1 and B4/B14 instead.
- **J3.** `loadGitLog` returns one freeform string and `prompt.ts` emits exactly one `=== GIT LOG ===` block (I4, carried forward).
- **J4.** No output in a selection mode contains `--- not yet on` (I2's replacement).

### Verification

`node scripts/probe-git-log.mjs`, extended in place — the existing fixture and its A1–A16/I1–I4 assertions stay and must keep passing, except the **five** criteria the preservation table names as narrowed (A2's second half, I2, A9, A15, A8's "no section names this branch" half), which are rewritten there, and the two unnumbered nets, whose fixtures are rebuilt as §Why specifies. Already wired into CI by `probe-git-log-ci`. `node scripts/probe-transform-preservation.mjs` must also pass — it pins the prompt rule array by exact string.

- allowed-surface:
  - `src/core/git-log.ts` — the predicate, its three paths, the new label, the window split between named and nameless landings, `loadNotLandedSections` inverted. Also `escapeMarkerLines`' docstring (`:470-482`), which enumerates the reserved header syntax and must name the third label — the function itself needs no change, since its regex keys on `--- `, not on the label.
  - `src/core/prompt.ts` — the git label vocabulary rule; the landed-wins rule is retired with its counterpart.
  - `scripts/probe-transform-preservation.mjs` — holds a verbatim copy of prompt.ts's git rules (`:434-440`) and asserts the joined array by exact string (`:497`); the prompt.ts change cannot land without editing it.
  - `starter-templates/work-log.md` — not-yet-landed wiring removed; the new label added to the header vocabulary.
  - `starter-templates/work-report.md` — "In progress / carried over" loses its GIT LOG source, **and "## Completed" gains the new label**: its selector reads "the GIT LOG's `--- landed <date>` sections" (`:43`), which does not select a `--- confirmed landed on <base>` section, so a path-2 confirmation would otherwise have no home in the report at all.
  - `src/core/starter-templates.ts` — generated by the prebuild hook; never hand-edited.
  - `scripts/probe-git-log.mjs` — fixture shapes, B1–B16, and the two rebuilt/re-anchored unnumbered nets.
  - `docs/templates-format.md` — the `[!git]` label table and the branch-selection paragraph.
  - `docs/architecture.md` — the `git-log.ts` row ("commits on unlanded branches are labelled, never counted as done") and its spec pointer, both stale under this contract.
  - `docs/prd.md` — one appended decision row superseding the not-yet-landed and unwindowed-pasted-mode decisions this work reverses. Append-only.
  - `README.md`, `README.ko.md` — the `[!git]` paragraph: what is now confirmed, and that unlanded work is no longer reported.
  - `CHANGELOG.md` — the release entry, same disclosure.
  - `docs/specs/git-log-landed-confirmation.md` — this contract.
- refactor-scope:
  - (none — surgical; §8 default applies)
