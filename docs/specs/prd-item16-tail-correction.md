---
status: confirmed
ceremony: trivial
---
# Correct the stale tail of `git-log-base-guard-pinning.md`'s allowed-surface qualifier

## §Why

Closes the follow-up left by deferred-followups item 16. That item's deciding unit ran on
2026-08-18 and fixed the binding unit of `allowed-surface` at the **path**, writing the rule into
the global `work-contract-format.md` and `governance-review.md` (harness `305a7aa`). One clause of
`git-log-base-guard-pinning.md`'s (`ddd71b41`) hand-written qualifier is falsified by that closure —
"Deferred item 16 records why this qualifier is written out — the deciding unit is still open" — and
that contract is confirmed, so editing it in place would void its confirmation; the correction goes
to `docs/prd.md`'s decision log instead, the channel items 19, 26 and 17-§26 already used. Goal: one
appended row recording precisely what changed and what did not, since the rest of that parenthetical
was **ratified rather than overturned** — its rule statement is now the normative text for every
contract in every profile, which is the more useful half of the record. Non-goals: editing
`git-log-base-guard-pinning.md` itself (voids confirmation, and its rule half is correct); editing
any other contract (a repo-wide search found this one clause to be the only reference to item 16 in
`docs/`); and removing the qualifier from contracts that already carry it — it is still useful prose,
it simply no longer narrows the gate. Success criteria: `docs/prd.md` gains exactly one row that
quotes the falsified clause verbatim, names the harness commit that closed it, and states that the
qualifier's rule half was promoted rather than retracted. Preservation contract: none needed — no
`src/` file and no probe is touched, and `docs/prd.md` is append-only, so no existing row changes.

## §Spec

- allowed-surface:
  - `docs/prd.md` — one appended decision-log row. Append-only.
  - `docs/specs/prd-item16-tail-correction.md` — this contract.
- refactor-scope:
  - (none)

Acceptance criteria:
- `docs/prd.md`'s decision log gains exactly one row, dated 2026-08-18, in the existing
  `| Date | Decision | Rationale |` shape, appended after the last row and above `## Out of scope`.
- The row quotes the falsified clause verbatim and cites the harness commit `305a7aa` that closed it.
- The row states explicitly that the parenthetical's rule half ("the binding unit of this list is the
  path"; the em-dash prose is intent, not a closed enumeration) was ratified into
  `work-contract-format.md` and `governance-review.md` rather than retracted.
- No line of `docs/prd.md` above the new row changes, and no other tracked file changes —
  `git diff` shows one added row plus this contract.
