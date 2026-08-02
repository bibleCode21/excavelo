---
status: draft
ceremony: trivial
---
# release-1.5.0

## §Why

Cut 1.5.0. `1.4.8` shipped on 2026-07-21; the 47 commits since are one body of work — the
`[!git]` rework across six units (landed-confirmation, named-window-invariance,
marker-reserved-vocab, base-named-merge, base-guard-pinning, plus the probe CI unit) — and its
user-facing account is already written in `CHANGELOG.md`'s `[Unreleased]` block. MINOR rather
than PATCH: that block carries a `### Removed` (the `--- not yet on <base>` sections no longer
appear) alongside changes to `[!git]`'s output shape, which is more than a patch may claim under
the SemVer the changelog header commits the project to. No code changes — this unit only names
the release and moves the metadata that names it.

## §Spec

Acceptance criteria:

- `CHANGELOG.md`'s `[Unreleased]` heading becomes `## [1.5.0] - 2026-08-02` with its body
  unchanged, and no `[Unreleased]` block is left behind empty. `release.yml` extracts release
  notes by `awk`-matching `^## \[<tag>\]`, so this heading is what the published release shows.
- `manifest.json` and `package.json` read `"version": "1.5.0"`; `versions.json` gains the key
  `"1.5.0": "1.8.7"`, taking `minAppVersion` from `manifest.json` unchanged.
- `1.5.0` is not a reused plugin version: `versions.json`'s existing keys run `0.1.0`–`1.4.8`,
  and every `1.5.0` string already in that file is a `minAppVersion` *value*, not a key.
- `git tag 1.5.0` matches `release.yml`'s trigger pattern `[0-9]+.[0-9]+.[0-9]+`, and the tagged
  commit is reachable from `origin/main` before the tag is pushed.
- `npm run build` and `npm run lint` behave exactly as they did at `2d13833` — no `src/` file is
  touched, so the probe suite's 182 checks are unaffected.

- allowed-surface:
  - CHANGELOG.md
  - manifest.json
  - versions.json
  - package.json
  - docs/specs/release-1.5.0.md
- refactor-scope:
  - (none)
