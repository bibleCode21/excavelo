---
status: confirmed
ceremony: trivial
---
# Wire the [!git] probe into CI

## §Why

`scripts/probe-git-log.mjs` (A1–A16 + I1–I4, 60 assertions covering `git-log-master-source`) only
runs when a human types `node scripts/probe-git-log.mjs`; `ci.yml` runs `pnpm lint` + `pnpm build`
only. If the 1.4.1 release failure's root cause was "no check existed," this is the same failure
mode wearing a different hat — a check exists but nothing runs it automatically. A14 is a timing
assertion (glob matcher must return well under a 1000ms threshold against a 100k-char adversarial
merge subject, guarding against a regex-backtracking regression); local runs pass at 195–370ms, but
one `loadGitLog` call in that fixture spends up to 4 git-process spawns inside `resolveBaseRef`
alone before the timed work even starts, leaving too little margin against a CI runner slower than
this machine. The fix is fixture-only (pre-seed an `origin/main` tracking ref so `resolveBaseRef`
resolves in its first spawn) — `src/core/git-log.ts` is untouched, and the 1000ms threshold itself
is preserved rather than loosened, since loosening it would dilute what A14 is actually meant to
catch (a correct matcher runs in the hundreds of ms; the regression it replaced measured 7531–
11800ms on the same input — there is no real ambiguity zone between those to widen into).

## §Spec

Observable behavior: `node scripts/probe-git-log.mjs` continues to report 0 failures after the
fixture change, with the three A14 elapsed-time lines showing lower numbers than before the change.
`ci.yml` gains a step that actually invokes the probe (not a placeholder) on every push/PR to `main`,
alongside the existing Lint/Build/Verify-artifact steps, which are otherwise unchanged.

Acceptance criteria:
- `node scripts/probe-git-log.mjs` exits 0 with all 60 checks passing, both before and after the
  fixture change (no regression).
- The three A14 `elapsed` timings measured after the fixture change are each lower than their
  pre-change baseline (195ms / 195ms / 370ms class, measured this session).
- `ci.yml` runs `node scripts/probe-git-log.mjs` as a real step on `push`/`pull_request` to `main`.
- `src/core/git-log.ts` has zero diff.

- allowed-surface:
  - `scripts/probe-git-log.mjs` — `buildLongSubjectFixture()` only: seed `refs/remotes/origin/main`
    + a symbolic `refs/remotes/origin/HEAD` so `resolveBaseRef` short-circuits on its first git
    spawn. No other fixture, no assertion logic, changes.
  - `.github/workflows/ci.yml` — one new step invoking the probe. Existing triggers and the three
    existing steps (Lint, Build, Verify build artifact) stay as they are.
- refactor-scope:
  - (none — surgical, §8 default)
