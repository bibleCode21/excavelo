---
status: confirmed
ceremony: trivial
approved-commit: b37cd88fb7847134526a2b03efdbd085800fd832
---
# `[!git]`: item 17's remaining low-cost bullets — two comment fixes, one pointer comment, one dead-code removal, one probe-comment trim

## §Why

Closes deferred-followups item 20 and four of item 17's bullets (module header, the two opposed comments at `git-log.ts:367`/`:879`, the `assigned` set, and the contract↔probe duplication) — all measured, all in the deferred-followups checkpoint. Goal: a one-line backreference comment (item 20), a module-header update naming the fourth nameless class, a clarifying clause distinguishing `BranchRef`-candidate filtering from the `Landing.branch` write boundary, removal of the `assigned` Set (test-author already measured 0 FAIL removing every `assigned.add`/`.has` site, and it is re-derivable dead here: `assigned` only ever holds a name that `test`/`selectedSpellings` already recognise, since `names` and `selectedBranches` share the same source), and trimming three probe block comments that restate `git-log-base-named-merge.md`'s "Beyond E1–E7" derivation to short pointers. Non-goal: renaming `landingName` (its identifier is quoted verbatim in two confirmed contracts; the cross-document drift cost outweighs the readability gain — closed wontfix, not deferred) and the probe file's structural split (a genuine multi-file reorganization, sized for its own unit). Success criteria: `node scripts/probe-git-log.mjs` exits 0 unchanged (same check count, same passes) after the `assigned` removal and after every comment edit. Preservation contract: `assigned`'s removal must not change any rendered output — proved by the full existing probe suite passing with zero new checks needed (test-author's own prior measurement already showed 0 FAIL; this unit re-verifies it live before committing).

## §Spec

- allowed-surface:
  - `src/core/git-log.ts` — the module header comment (nameless-class enumeration); the doc comments at `:367` and `:879` (or their current line numbers); the comment above the path-1 merge-parse write site (`:534` area); the `assigned` Set and its two use sites (declaration, `.add`, `.has`) and their surrounding comments.
  - `scripts/probe-git-log.mjs` — the three "Beyond E1–E7"-derivation block comments, trimmed to pointers; no check bodies change.
  - `docs/specs/git-log-comment-and-dead-code-cleanup.md` — this contract.
- refactor-scope:
  - `src/core/git-log.ts` — deleting the `assigned` Set (dead code per the preservation contract above: output-neutral, re-verified live).

Acceptance criteria:
- A one-line comment near the path-1 merge-parse write site (`git-log.ts:534` area) points to the read-side gate that mirrors its rule, so an editor at either site learns the other exists.
- The module header's nameless-landing sentence names the fourth class (a merge whose subject parses to the base's own name) alongside squash/rebase/direct.
- The comment at `loadConfirmedSections`'s `namesBase` reapplication (`:879` area) states it filters `BranchRef` candidates, not `Landing.branch` — distinguishing it from the write-boundary comment at `:367`, which keeps its text.
- `node scripts/probe-git-log.mjs` passes, unchanged check count, after `assigned` and every `.add`/`.has` reference to it are deleted and `match`'s condition drops the `assigned.has(...)` clause.
- The three probe comments preceding the `cap priority`, "windowed-out header-only", and "path 1 renames" checks are shortened to point at `git-log-base-named-merge.md`'s "Beyond E1–E7" section rather than restating its derivation.
