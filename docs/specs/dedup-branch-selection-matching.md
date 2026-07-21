---
status: confirmed
ceremony: trivial
approved-commit: 4acd562d055462a11d3adec80f05361cff14d110
---
# Dedup branch-selection matching in loadGitLog

## §Why

`loadGitLog` (`src/core/git-log.ts`) implements the same shape twice: build a per-name matcher, then compute `selectedBranches = branches.filter((b) => test(b.display) || test(b.ref))` — once for the `spec.branches` glob mode (`git-log.ts:649-650`, `test = globMatch(name, glob)`) and once for the pasted-candidates mode (`git-log.ts:658-659`, `test = wanted.has(name.toLowerCase())`), flagged as a design WARN across all four `[!git]` master-source review rounds and deferred every time for lack of a refactor-scope license (deferred-followups item 8). Goal: extract the repeated `branches.filter((b) => test(b.display) || test(b.ref))` shape into one shared helper and call it from both modes. Non-goal: no change to `globMatch`, to the pasted-candidates `wanted` Set matching, to `hit`'s own signature/behavior, or to any other function in the file. Preservation contract: `loadGitLog`'s output stays byte-identical for every existing input — enforced by `scripts/probe-git-log.mjs`'s full suite (all checks, unmodified) staying green before and after. Refactor rationale: the two blocks are already behaviorally identical in shape (only the per-name test differs), so this is pure duplication removal, not a design change.

## §Spec

Acceptance criteria:
- `src/core/git-log.ts` gains one helper, e.g. `selectBranches(branches: BranchRef[], test: (name: string) => boolean): BranchRef[]`, returning `branches.filter((b) => test(b.display) || test(b.ref))` — the logic currently duplicated at both call sites, moved verbatim (not rewritten).
- Both the `spec.branches` glob branch and the pasted-candidates branch in `loadGitLog` call this helper instead of their own inline `.filter(...)`.
- `globMatch`, the `wanted` Set construction/lookup, and the `hit`/`match` closures' external behavior are unchanged.
- No other line in the file changes.
- `scripts/probe-git-log.mjs` (all checks, including the glob cases, A1/A2/A11/A13, and today's marker-spoofing/expandHome additions) passes unmodified — no new assertions required, since this is a no-behavior-change move.
- `pnpm lint` and `pnpm build` stay clean (0 new errors/warnings).

- allowed-surface:
  - src/core/git-log.ts
  - docs/specs/dedup-branch-selection-matching.md
- refactor-scope:
  - src/core/git-log.ts
