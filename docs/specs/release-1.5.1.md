---
status: confirmed
ceremony: trivial
approved-commit: 9e20a3ac713a4587a2620b43ab7a3daaaf0eb2d0
---
# release-1.5.1

## §Why

Cut 1.5.1. `1.5.0` shipped on 2026-08-02; the 61 commits since are entirely internal —
`src/` carries exactly one change in the range, `git-log.ts`'s marker-escape widening to Unicode
Zs whitespace (`marker-escape-control-bytes`), whose own confirmed contract states no CHANGELOG
entry because output is byte-identical for every commit message that is not itself an attack —
and everything else is CI/build-pipeline and dev-script work (the four GitHub Actions moved off
the deprecated Node 20 runtime and then onto exact-commit pins with Dependabot; `ci.yml` now runs
all six probes instead of one of six and `release.yml` now refuses to publish an empty-bodied
release, both from `release-metadata-invariants`, which merged after the 1.5.0 tag was cut and so
falls inside this range; `probe-git-log.mjs` was split into modules, a probe-argv-limit bug was
fixed, and several doc/test-pin and comment/dead-code-cleanup batches landed) — verified by
reading `git diff 1.5.0..main --stat -- src/` (one file) and auditing every other touched path by
category, not assumed from commit subjects. The first draft of this audit missed
`release-metadata-invariants`; the feature-complete design review caught it, and this paragraph is
the fix, not a silent correction. PATCH rather than MINOR: nothing in the plugin's build output (`main.js`)
differs for any legitimate use. This is the corrected axis deferred-followups item 25 named: `release-1.5.0`'s
own criterion asked whether the CHANGELOG body was "unchanged" from a draft, which is answerable
without checking it against what the tag range actually shipped, and its panel round caught three
factual errors that axis could not have caught by construction. This contract's acceptance
criteria ask the outcome question instead.

## §Spec

Acceptance criteria:

- `CHANGELOG.md` gains a `## [1.5.1] - 2026-08-18` heading whose body is checked against
  `git diff 1.5.0..main`, not assumed: every sentence in it names something the diff actually
  contains, and no user-observable change in the diff (there are none beyond the byte-identical
  marker-escape widening, which the confirmed `marker-escape-control-bytes` contract already
  rules out of the CHANGELOG) is missing from it.
- `manifest.json` and `package.json` read `"version": "1.5.1"`; `versions.json` gains the key
  `"1.5.1"` mapped to `manifest.json`'s current `minAppVersion` (`1.8.7`) unchanged — written by
  `npm version 1.5.1 --no-git-tag-version` (leaves the commit to the gate, per `release-1.5.0`'s
  precedent), not by hand.
- `1.5.1` is not a reused plugin version: `versions.json`'s existing keys run `0.1.0`–`1.5.0`.
- `node scripts/probe-release-metadata.mjs` passes at the release commit — R1/R2/R3 all hold for
  the new version, and its own checks did not exist at 1.5.0's release, so this is new coverage
  the 1.5.0 cut did not have.
- `git tag 1.5.1` matches `release.yml`'s trigger pattern `[0-9]+.[0-9]+.[0-9]+`, and the tagged
  commit is reachable from `origin/main` before the tag is pushed.
- `npm run build` and `npm run lint` behave exactly as they do at this branch's tip — no `src/`
  file is touched by this contract, so the probe suite is unaffected by it.

- allowed-surface:
  - CHANGELOG.md
  - manifest.json
  - versions.json
  - package.json
  - docs/specs/release-1.5.1.md
- refactor-scope:
  - (none)
