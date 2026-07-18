---
status: confirmed
ceremony: standard
approved-commit: 7ddabf5e8fa6bf738a4e840b576f148219eeb304
---
# `nodeApis()`: add a `Platform.isDesktop` guard, keep `require()`

Supersedes the discarded draft `node-apis-dynamic-import.md`. That draft's premise
— that `require()` had to become `await import()` — is false in both directions:
dynamic `import()` **breaks at runtime** under Obsidian's plugin loader
(measured; see `[[obsidian-plugin-loader-no-dynamic-import]]`), and the lint rule
that motivated the change **explicitly accepts a guarded `require()`**.

Revised after `spec-review` CHANGES_REQUESTED (38/100, 2 BLOCK) on the first draft of
this rewrite: that draft misidentified the locally-active lint rule as
`no-require-imports` (v8-era name) when this repo pins v7, where `no-var-requires` is
the rule actually enabled, and asserted `isDesktop`/`isMobile` complementarity as
fact with no citation. Both are corrected below.

## §Why

- **Goal** — clear all 7 `obsidianmd/no-nodejs-modules` findings across
  `claude-code-cli.ts` and `git-log.ts` by adding a `Platform.isDesktop` early-exit
  guard as the first statement of each file's `nodeApis()`. `require()` stays.

- **Evidence** (measured this session, not inferred):
  - Rule source (`eslint-plugin-obsidianmd/dist/lib/rules/noNodejsModules.js`)
    accepts `require()` when guarded — its own message reads *"Use a dynamic
    import() or require() guarded by Platform.isDesktop instead."*
  - Guard applied to both files → `no-nodejs-modules` **7 → 0**, with `pnpm lint`
    (the repo's actual v7 config) staying green throughout — the pre-existing
    `no-var-requires` disable directive already covers the `require()` calls; see
    the Residual note below for why an earlier draft's `no-require-imports` framing
    was wrong.
  - `hasGuardAtFunctionStart` requires the guard be the **literal first statement**
    of the containing function, shaped `if (!Platform.isDesktop) throw|return`, with
    no `else`. Anything else does not match.
  - PRD §3 WU-2's `Platform.isDesktopApp` is **wrong**: the rule string-matches
    `"isDesktop"`. Both fields exist in `obsidian.d.ts`, so the type checker will not
    catch the mistake.

- **Non-goals** — no signature changes; `nodeApis()` stays **synchronous** (this is
  what kills the discarded draft's two BLOCKs: no async ⇒ no `killTree` fire-and-forget
  race, no unhandled rejection); no new probe; no dependency; no change to the outer
  `Platform.isMobile` guards; no change to any file beyond the three in allowed-surface.

- **Preservation contract**
  1. Structural half (verified by call-graph trace): every `nodeApis()` caller already
     sits behind an outer `isMobile` guard — `claude-code-cli.ts` via the constructor
     throw (:343), `ping()` (:414) and `detect()` (:438); `git-log.ts` via
     `loadGitLog()` (:508), the sole entry point reaching `runGit`/`expandHome`. The
     inner guard can only matter on a path where `isMobile === false`.
     `claude-code-cli.ts` additionally has a *third*, still-earlier guard on its main
     UI entry point: `main.ts:139`'s `providerFor()` checks `Platform.isMobile` before
     ever constructing `ClaudeCodeCliProvider`, routing to `AnthropicProvider` instead
     — one more redundant layer, not a weaker one.
  2. Semantic half — **accepted as an untestable residual, not resolved**. Whether
     `isDesktop` is the exact runtime negation of `isMobile` cannot be settled from
     `obsidian.d.ts` alone — its doc comments describe UI mode, and `isDesktopApp` is
     the separately-documented Node-availability signal, so the two are not
     definitionally identical. Research turned up `app.emulateMobile()`, the one
     known mechanism that decouples UI mode from the Electron/Node runtime — but it
     works by flipping `isMobile` itself, which every existing *outer* guard already
     intercepts before `nodeApis()` is reached. That makes the residual assumption
     structurally unfalsifiable with available tooling: constructing a test requires
     `isMobile === false` (to get past the outer guards) *and* `isDesktop === false`
     (to exercise the inner one), and no documented Obsidian mechanism produces that
     combination. An earlier version of this contract added a manual
     `app.emulateMobile()` smoke check meant to close this gap; it was dropped after
     `spec-review` showed it could only ever observe the outer guard intercepting
     first, regardless of whether the inner guard's condition was correct — a
     criterion that reports "pass" unconditionally isn't a test.

     What bounds the risk instead: **the failure mode if this assumption is ever
     wrong is a clear thrown error** (`"Node APIs are desktop-only."` /
     `t("git.desktop-only")`), not silent misbehavior or data loss — on any path
     where `isMobile === false && isDesktop === false` that isn't already caught by
     an outer guard, the plugin fails loudly instead of, at worst, calling
     `require()` in an environment where it may not exist. This does not prove
     behavioral equivalence per governing spec §8; it is the explicit surfacing of
     doubt that §8 asks for when equivalence can't be proven — flagged here rather
     than silently assumed, for the user to accept or reject at confirmation.
  3. **Known wart, accepted deliberately**: `isDesktop` means *UI is in desktop mode*,
     not *Node exists* — `isDesktopApp` is the more semantically apt field. The guard
     uses `isDesktop` because the lint rule hard-codes that exact string; it is a
     lint-satisfying condition, not a claim that this is the ideal runtime check. The
     comment above it says so.
  4. `candidateBinaries` probe order, `buildCliSpawn` `.cmd`/`.bat` routing, `runCli`
     spawn/timeout/`killTree`/stdin-EPIPE semantics, `runGit`'s ENOENT fallthrough, and
     `expandHome`'s `~` expansion are all untouched.

- **Residual, and why it is not a defect** — the repo pins
  `@typescript-eslint/eslint-plugin@^7.0.0` (installed 7.18.0). At that version
  `no-var-requires` — not `no-require-imports` — is the live rule (enabled today via
  `tsplugin.configs.recommended.rules` in `eslint.config.mjs`); confirmed by stripping
  the existing disable directive and observing 7 fresh errors reappear. The existing
  file-local `eslint-disable @typescript-eslint/no-var-requires` directive is therefore
  **already correctly targeted** and is kept unchanged in name — only its reasoning
  comment is updated to name the guard. (`no-require-imports`, the rule PRD §1.3 named,
  is not registered as a repo rule at this version; it may be what the bot's own lint
  environment reports on a newer typescript-eslint, but that is not this repo's
  measurable state and is not a WU-2 success criterion — WU-6, which adopts newer
  rule sets, is where that gets resolved.) The bot's downstream `no-unsafe-*` cascade
  (untyped `require` in a `@types/node`-less lint env) persists and is **out of
  scope**: those are Warnings; what blocked review was the attestation Error.

## §Spec

### Change (both files, identical shape)

```ts
function nodeApis() {
  if (!Platform.isDesktop) throw new Error(/* per-file message, see below */);
  /* eslint-disable @typescript-eslint/no-var-requires -- Obsidian eval-loads plugins
     as a classic script with its own require shim; the ESM import this rule
     prescribes fails at runtime here (measured). require() is the working form, and
     obsidianmd/no-nodejs-modules explicitly permits it behind the guard above. */
  return { cp: require("child_process") as typeof import("child_process"), /* … */ };
  /* eslint-enable @typescript-eslint/no-var-requires */
}
```

The rule name in the disable directive is **unchanged** from what's already in both
files today — only the comment's reasoning is updated. `Platform` is already imported
in both files. No call site changes — `nodeApis()` stays sync.

Each file keeps its own error convention for the guard, matching how each already
signals the desktop-only condition elsewhere in the same file:
- `claude-code-cli.ts`: `throw new LlmError("Node APIs are desktop-only.")` (the file
  uses `LlmError` throughout, including its own outer guard at :344).
- `git-log.ts`: `throw new Error(t("git.desktop-only"))` — reusing the same i18n key
  its outer guard already throws at :509 (no new translation string needed).

### Probe stub — must land with the guard, not after

`scripts/probe-git-log.mjs:78` writes `export const Platform = { isMobile: false };`.
With the guard added and no `isDesktop`, `!undefined === true` → **every probe
assertion reaching `nodeApis()` throws**. The stub gains `isDesktop: true` in the
same commit as the guard.

### Success criteria

1. `obsidianmd/no-nodejs-modules` → **0** findings on both files (baseline 7),
   measured by temporarily enabling the rule locally, as WU-6 will do permanently.
2. `@typescript-eslint/no-var-requires` stays suppressed by the existing file-local
   directive (unchanged rule name); no other rule is newly disabled anywhere in
   either file.
3. Each `nodeApis()`'s guard is the literal first statement; `nodeApis()` is still
   `function` (not `async function`) in both files.
4. `pnpm build` (tsc + esbuild) passes.
5. `node scripts/probe-git-log.mjs` passes **unchanged** (60 assertions) — asserts the
   guard did not break the reachable path.
6. `pnpm lint` (repo config, unchanged) stays green — this is what makes criterion 2
   real rather than assumed.
7. Manual smoke check, real vault, **normal desktop state only** (no emulation — the
   Preservation contract's semantic-half note explains why an `emulateMobile()`-based
   check can't test anything here): "Test connection" with `authMethod: claude-code-cli`
   succeeds as it did before the change, and a git-log-bearing memo still produces the
   same git-log section it did before. This verifies the guard doesn't disturb the
   one path that's actually exercised in practice; it does not and cannot verify the
   semantic-half residual noted in the Preservation contract.

### Invariants

- **I1** — guard is the literal first statement of `nodeApis()` (rule requirement).
- **I2** — the field is `Platform.isDesktop`, never `isDesktopApp`.
- **I3** — `nodeApis()` itself stays a synchronous `function`, never `async`
  (existing callers' own sync/async status is unaffected — e.g. `candidateBinaries()`
  is already `async` today, independent of this change).
- **I4** — no `await import()` of a Node builtin is introduced anywhere.

- allowed-surface:
  - src/llm/claude-code-cli.ts — `nodeApis()` only
  - src/core/git-log.ts — `nodeApis()` only
  - scripts/probe-git-log.mjs — the `obsidian` stub line only
- refactor-scope: none. Insertions only; no restructuring is licensed.
