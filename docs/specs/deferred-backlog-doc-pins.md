---
status: confirmed
ceremony: trivial
approved-commit: c24b24213931181fa57039890dfc2b85bcc228da
---
# Deferred-followups backlog: comment/test/doc pins with zero production-behavior change

## §Why

Closes deferred-followups items 21, 22, 27, 19, 26, and the "B12" and "§26 rationale" bullets of item 17 — all pure test-assertion additions or documentation corrections, none touching `src/`. Goal: pin facts that are true today but currently unasserted (a terminology mismatch in a check title, two mutation gaps in existing probes, and false sentences inside three already-confirmed work contracts), each already measured and cited in the deferred-followups checkpoint. Non-goal: anything requiring a `src/` edit (items 20 and item 17's module-header/contradictory-comment bullets — deferred to a future unit that already needs to touch `src/core/git-log.ts`) or anything needing its own investigation/decision (items 5, 14, 16, and item 17's naming/probe-structure/dead-code bullets). Success criteria: `node scripts/probe-git-log.mjs` and `node scripts/probe-release-metadata.mjs` both exit 0 with the new assertions included, and the three new `docs/prd.md` rows each quote the confirmed contract's false sentence verbatim and cite the measured correction. Preservation contract: none needed — no `src/` file is touched, verified by `allowed-surface` below excluding it entirely. User explicitly waived the feature-complete full panel for this specific unit (all touched paths are non-prod; recorded here per the lifecycle spine's checkpoint-discipline clause, not a standing policy change).

## §Spec

- allowed-surface:
  - `scripts/probe-git-log.mjs` — E2's check title; the M1 sweep's per-label section-count assertion; one pointer comment above the "B12 —" check cluster.
  - `scripts/probe-release-metadata.mjs` — one new check pinning `unwiredIn`'s substring-anchor specificity.
  - `docs/prd.md` — three appended decision-log rows (append-only), correcting `git-log-base-guard-pinning.md`, `release-metadata-invariants.md`, and `git-log-base-named-merge.md`.
  - `docs/specs/deferred-backlog-doc-pins.md` — this contract.
- refactor-scope:
  - (none)

Acceptance criteria:
- E2's title reads "the no-selection path" instead of "the plain path" (the other 6 uses in the file already say `no-selection path`).
- M1 asserts each of its 9 labelled outputs did not throw (`!out.startsWith("<threw:")`), in addition to its existing header check — not a bare `sections(out).length > 0`, since one label (E6's disappearance direction) legitimately renders zero sections by design.
- A new check asserts `unwiredIn` still reports a probe as unwired when a line merely names it (e.g. a `name:` field) without the `node scripts/` prefix — pinning that the anchor is not weakenable to a bare substring without a test going red.
- A short comment precedes the "B12 —" check cluster distinguishing `git-log-landed-confirmation.md`'s literal B12 (a *candidate* naming the base — one check, already accurate) from the broader "no landing is ever named the base" rule (`M1`) that the cluster's other checks actually pin.
- `docs/prd.md` gains three rows (2026-08-02), each citing the exact false sentence in its target confirmed contract and the measured correction, per the existing append-only convention (2026-08-01 row).
