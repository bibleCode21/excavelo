---
status: confirmed
ceremony: trivial
approved-commit: 7846a122ec177dd77836ce4848943534e2157704
---
# Dedup prompt-format label() helper

## §Why

`label()` — `` `=== ${s} ===` `` — is defined verbatim in both `src/core/prompt.ts:75-77` and `src/core/verify.ts:172-174`, flagged as a design WARN across the completeness-verify-chain panel rounds and deferred each time because `prompt.ts` was outside that unit's allowed-surface. Goal: extract the one identical helper into a new shared module (`src/core/prompt-format.ts`) and import it from both call sites, deleting the two local definitions. Non-goal: any change to the section-marker format itself or to either file's prompt-assembly logic. Preservation contract: `buildPrompt()`'s and `buildVerifyPrompt()`/`buildRepairPrompt()`'s output strings stay byte-identical — enforced by the existing `scripts/probe-git-log.mjs` (pins `=== GIT LOG ===`/`=== OUTPUT RULES ===` etc.) and `scripts/probe-verify-chain.mjs`, both of which must stay green unmodified. Refactor rationale: the two functions are already 100% identical, so this is pure duplication removal, not a design change.

## §Spec

Acceptance criteria:
- `src/core/prompt-format.ts` exports `label(s: string): string` returning `` `=== ${s} ===` `` — the existing implementation moved verbatim.
- `src/core/prompt.ts` and `src/core/verify.ts` import `label` from it; their local `function label` definitions are deleted.
- No other line in either file changes.
- `scripts/probe-git-log.mjs`, `scripts/probe-verify-chain.mjs`, `scripts/probe-transform-preservation.mjs` all pass unmodified (no new assertions needed — this is a no-behavior-change move, not new behavior).
- `pnpm lint` and `pnpm build` stay clean (0 new errors/warnings).

- allowed-surface:
  - src/core/prompt-format.ts
  - src/core/prompt.ts
  - src/core/verify.ts
  - docs/specs/dedup-prompt-label.md
- refactor-scope:
  - src/core/prompt.ts
  - src/core/verify.ts
