---
status: confirmed
ceremony: trivial
approved-commit: e4026335345fae70f0db007d9488ca82ee21166f
---
# GitHub Actions: pin the four actions to a commit SHA, not a mutable tag

## §Why

Closes deferred-followups item 28, the SC-16 supply-chain residual `actions-node24-bump` surfaced as
a byproduct: `ci.yml` / `release.yml` reference `actions/checkout@v7`, `pnpm/action-setup@v6`,
`actions/setup-node@v7`, and `actions/attest-build-provenance@v4` by a mutable major tag, which the
publisher can repoint to different code without this repo's review. Each is pinned to the exact
commit its tag resolves to today — verified against each repo's GitHub API (`git/refs/tags/<tag>`,
dereferenced through the tag object where the tag is annotated, i.e. `pnpm/action-setup` and
`attest-build-provenance`), so the pin is a mechanism change, not a version bump: every action keeps
running the identical code it runs today (`checkout` v7.0.1, `action-setup` v6.0.10, `setup-node`
v7.0.0, `attest-build-provenance` v4.2.2). A new `.github/dependabot.yml`
(`package-ecosystem: "github-actions"`) is what keeps the pins from going stale — Dependabot
understands the `@<sha> # v<tag>` convention and opens a PR bumping both halves together. Non-goals:
any further version bump (the four majors `actions-node24-bump` already chose are unchanged); any
change to `node-version: 22`, `cache: pnpm`, the `packageManager` comments, step order, or any `run:`
block; a Dependabot config for `npm`/`pnpm` package updates (out of scope — this unit is CI-action
supply-chain only). Success criteria: every `uses:` line in both workflows carries a 40-hex-character
SHA plus a trailing version comment; `dependabot.yml` declares the `github-actions` ecosystem; the CI
run on the merge commit is green. Preservation contract: both pipelines' observable behavior is
byte-identical to `actions-node24-bump`'s own — same runtime, same cache strategy, same steps, same
artifacts — since pinning to the tag's own current target changes nothing any workflow step observes.

## §Spec

- allowed-surface:
  - `.github/workflows/ci.yml` — the three `uses:` version strings, nothing else.
  - `.github/workflows/release.yml` — the four `uses:` version strings, nothing else.
  - `.github/dependabot.yml` — new file.
  - `docs/specs/actions-sha-pinning.md` — this contract.
- refactor-scope:
  - (none)

Acceptance criteria:
- `ci.yml` pins `actions/checkout`, `pnpm/action-setup`, `actions/setup-node`; `release.yml` pins
  those same three plus `actions/attest-build-provenance` — each as `owner/repo@<sha> # v<exact-tag>`.
- Every SHA is the commit the action's current major tag resolves to, confirmed against the GitHub
  API rather than assumed — `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1`,
  `pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86  # v6.0.10`,
  `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020  # v7.0.0`,
  `actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8  # v4.2.2`.
- `.github/dependabot.yml` exists, declares `version: 2` and one `updates:` entry with
  `package-ecosystem: "github-actions"`, `directory: "/"`, and a `schedule.interval`.
- The workflow diff touches no other line — `node-version: 22`, `cache: pnpm`, the
  `# version is read from packageManager in package.json` comments, step names, and every `run:`
  block stay byte-identical to `actions-node24-bump`'s result.
- No probe or other tracked file pins an action version by tag or SHA, so no check changes —
  confirmed by a repo-wide search for `checkout@` / `setup-node@` / `action-setup@` /
  `attest-build-provenance@` returning only the two workflow files and the historical `CHANGELOG.md`
  rows.
- After merge, the CI run on that `main` push is green.
