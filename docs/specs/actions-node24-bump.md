---
status: confirmed
ceremony: trivial
approved-commit: e48ea53b2ccc512d601f777250b73525335e16da
---
# GitHub Actions: bump the four actions off the Node 20 runtime

## §Why

Closes deferred-followups item 5. All four actions used by `ci.yml` / `release.yml` declare the
Node 20 runtime, which GitHub now force-runs on Node 24 while attaching a deprecation warning to
every run; each is bumped to the current major that declares `node24` — `actions/checkout` v4→v7,
`pnpm/action-setup` v4→v6, `actions/setup-node` v4→v7, `actions/attest-build-provenance` v2→v4.
The intervening breaking changes were measured against the actions' own release notes and manifest
rather than assumed: setup-node v5/v6 restrict *automatic* caching to `packageManager: npm`, which
this repo (`pnpm@11.9.0`) never triggers, while v7's `action.yml` still lists `pnpm` among the
explicit `cache:` input's supported values; checkout v7's fork-PR block applies only to
`pull_request_target` / `workflow_run`, neither of which this repo uses, and v6's move of persisted
credentials to a separate file cannot matter because no step runs an authenticated git command after
checkout (`gh` receives an explicit `GH_TOKEN`); pnpm/action-setup v6 is the major that *adds* pnpm 11
support, which is what `packageManager` pins; and attest-build-provenance v4 is a documented wrapper
over `actions/attest` with `subject-path` unchanged. Non-goals: replacing
`attest-build-provenance` with `actions/attest` (v4's note recommends it for new implementations —
that is a release-path change, not a runtime bump); any change to `node-version: 22`, the `cache: pnpm`
strategy, the pnpm version pin, step order, or any `run:` block; and any rewrite of the historical
`CHANGELOG.md` rows that name `@v2` / Node 20 (append-only record of what those releases actually did)
or of `release-metadata-invariants.md`'s §Non-goals sentence deferring item 5 — that sentence is a true
statement about *that* unit's scope, not a false claim, so the `docs/prd.md` correction channel does not
apply. Success criteria: the CI run triggered by pushing the merge commit to `main` is green and its log
carries no Node 20 deprecation warning. Preservation contract: every observable behavior of both
pipelines survives — `ci.yml` still installs from a frozen lockfile under Node 22 with the pnpm cache,
lints, runs the same six probes split across the same two steps, builds, and verifies the same three
artifacts; `release.yml` still attests the same three subject paths and publishes a release whose body
is the tag's CHANGELOG section, with the empty-notes guard intact. No `src/` file is touched. Accepted
residual, stated rather than discovered: `release.yml` runs only on a tag push, so
`attest-build-provenance@v4` stays unexercised until the next release — the other three bumps are
covered by the CI run on the merge commit, since `ci.yml` uses the identical versions.

## §Spec

- allowed-surface:
  - `.github/workflows/ci.yml` — the three `uses:` version strings, nothing else.
  - `.github/workflows/release.yml` — the four `uses:` version strings, nothing else.
  - `docs/specs/actions-node24-bump.md` — this contract.
- refactor-scope:
  - (none)

Acceptance criteria:
- `ci.yml` pins `actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7`;
  `release.yml` pins those same three plus `actions/attest-build-provenance@v4`.
- The diff is exactly seven changed lines across the two files and touches no other line —
  `node-version: 22`, `cache: pnpm`, the `packageManager` comments, step names, and every `run:`
  block are byte-identical.
- The two `# version is read from packageManager in package.json` comments remain accurate: the
  `ERR_PNPM_BAD_PM_VERSION` behavior they describe was introduced in `pnpm/action-setup` v4 and is
  untouched by v5 (Node 24 runtime) and v6 (pnpm 11 support), so neither workflow gains a `version:`
  input.
- No probe or other tracked file pins an action version, so no check changes — confirmed by a
  repo-wide search for `checkout@` / `setup-node@` / `action-setup@` / `attest-build-provenance@`
  returning only the two workflow files and the historical `CHANGELOG.md` rows.
- After merge, the CI run on that `main` push is green and shows no Node 20 deprecation warning.
