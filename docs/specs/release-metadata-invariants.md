---
status: confirmed
ceremony: standard
approved-commit: 0860dac05c7a273de11800d5d67dcd779e8dafa0
---
# Release metadata is checked by something other than the person cutting the release

## §Why

- **Goal** — close deferred-followups 23 and 24. Three facts have to agree for a release to
  work — `package.json` and `manifest.json` on the version, `versions.json` on the
  `minAppVersion` for that version, and `CHANGELOG.md` on having notes under a heading named
  for it — and nothing checks any of them. The third fails *silently*: `release.yml` extracts
  notes by `awk`-matching `^## \[<tag>\]`, and with no match the extraction is 0 bytes, which
  `gh release create --notes-file` publishes as an **empty release body while the workflow
  reports success** (measured). Separately, `ci.yml` runs one of the five probe scripts, so
  241 of the repository's 423 checks never run on a push or a pull request — and the repo's
  only assertion about `manifest.json` (`probe-settings-tab.mjs:1086`) is among them.

- **Non-goals** — the historical rows of `versions.json` (`1.4.2`/`1.4.3` map to an Obsidian
  version that was never publicly released; those are published, immutable facts that old
  builds still resolve against, so nothing here audits or edits them). No extraction of the
  `check()` harness duplicated across the probe scripts — five files, unrequested. No
  re-implementation of `release.yml`'s `awk` in JavaScript: the probe expresses the same
  requirement independently rather than copying a second, drift-prone parser. `version-bump.mjs`
  is untouched — it already encodes R2 correctly and the gap is that a hand bump bypasses it.
  Deferred item 5 (Node 20 deprecation warnings on the actions) stays open. And the release path
  itself gains no metadata check beyond the empty-notes guard: R1 and R2 remain CI-time only, so
  a tag pushed on a commit whose CI has not run — or a tag whose name differs from
  `manifest.version`, which nothing here examines — can still publish desynced metadata. Only R3
  gets a tag-time backstop.

- **Success criteria**
  1. A new `scripts/probe-release-metadata.mjs` fails — non-zero exit, `N failed` — when any of
     R1/R2/R3 below is violated, each shown by mutating a scratch copy, and passes at `HEAD`.
  2. `ci.yml` runs all six probes. The evidence that the four which have never executed on a
     runner work there arrives in two parts, because no pre-merge observation point exists:
     `ci.yml` fires only on push-to-`main` and pull-request-to-`main`, `origin` carries no branch
     but `main`, and this repository does not use pull requests. Editing `on:` to manufacture one
     is excluded by the preservation contract below.

     **Before the merge**, two deltas are closed:

     *Path case.* Every filesystem path the four probes reference resolves with exactly the case
     written — a wrong-case path is invisible on this case-insensitive working copy and fatal on
     the runner. The oracle is `git ls-files`, compared segment-wise; an existence test is not
     admissible, since `test -e` and `fs.existsSync` both answer true for a wrong-case path here
     and the check would pass while proving nothing. The references are extensionless module
     specifiers (`src/i18n` → `src/i18n/index.ts`), so the comparison covers the written segments
     and ignores the suffix esbuild resolves.

     *Runtime.* `ci.yml` pins `node-version: 22` while this machine's default `node` is v18, so a
     green local run says nothing about the runner's runtime. The four probes are run once under
     Node 22 (already installed) and must pass there.

     The remaining deltas are accounted for by class: the probes pass `-c user.name=…` per git
     invocation and `git init -b main`, so neither the runner's global git config nor
     `init.defaultBranch` reaches them, and the esbuild platform binary and the git version are
     classes `probe-git-log.mjs` already proves by running in CI today.

     **After the merge**, the push-to-`main` run observes the remainder. **If it reddens one of
     the four existing probes, this contract is reopened** — new branch, surface amendment,
     re-review, re-approval — rather than the probe being repaired in place: none of the four is
     in `allowed-surface`, and nothing mechanical would object, since `PROD_RE` excludes
     `scripts/` so governance's out-of-surface gate never fires for this unit.
  3. `release.yml` fails before `gh release create` when the extracted notes are empty,
     demonstrated by running its extraction plus the guard against a tag with no matching
     heading — **and** the same extraction plus guard, run against `1.5.0`, exits 0 and emits
     notes equal to the `body` field of `gh release view 1.5.0 --json body`. Compare the raw
     field, not `-q .body`, which appends its own newline and manufactures a one-byte mismatch.

- **Preservation contract** — both workflows are green today and `release.yml` published 1.5.0
  minutes ago. Neither file's workflow-level configuration changes: `ci.yml` keeps
  `push`/`pull_request` on `main`, `release.yml` keeps `push: tags: '[0-9]+.[0-9]+.[0-9]+'` as
  its sole trigger, and `permissions:` is unchanged in both. No existing step in either file may
  be removed, reordered, or have its command changed; `ci.yml`'s probe step must stay ahead of
  `Build` (the probes need `pnpm install` for
  esbuild, never the build output) and `probe-git-log.mjs` keeps a step of its own so a failure
  there is attributable at a glance. The guard added to `release.yml` may only introduce a new
  failure path for empty notes — extraction, attestation, and asset upload behave exactly as
  they do now for every non-empty extraction.

- **Refactor rationale** — none. Nothing existing is restructured.

## §Spec

### The three invariants

The probe reads `manifest.json` and derives everything from it. **No version literal appears
anywhere in the file**, so no future release edits it — the same reasoning
`probe-settings-tab.mjs:1086` already records for pinning `minAppVersion` but not `version`.

- **R1** — `package.json`'s `version` equals `manifest.json`'s `version`.
- **R2** — `versions.json[manifest.version]` exists and equals `manifest.json`'s `minAppVersion`.
  Only that one key is examined.
- **R3** — `CHANGELOG.md` contains exactly one line **beginning** `## [<manifest.version>]`, and
  the lines **after** it up to the next line beginning `## [` (or end of file) include at least
  one line containing a non-whitespace character. After, not from: counting the heading itself
  would let it supply the non-whitespace and make the body check unfailable. Both predicates match at line start, since real
  headings carry a date suffix (`## [1.5.0] - 2026-08-02`). Non-blank means `/\S/`, not
  `!== ""`: `release.yml`'s trim is `awk 'NF{p=1} p'`, for which a whitespace-only line has
  `NF == 0`, so a section of nothing but spaces still extracts to 0 bytes and still publishes an
  empty body — the exact case this invariant exists to catch.

### Acceptance criteria

- `node scripts/probe-release-metadata.mjs` prints one `ok` line per check, exits 0 at `HEAD`,
  and follows the existing probe convention: a self-contained `check(name, fn)` over
  `node:assert`, `N failed` plus exit 1 on failure, `all passed` otherwise.
- Each invariant is demonstrated live, on a copy — never the working tree. "And no other" ranges
  over **invariants**, not over individual `check()` lines: R3 may be more than one check, and a
  mutation may redden several of R3's checks so long as it reddens nothing belonging to R1 or R2.

  | mutation | expected red |
  |---|---|
  | `package.json`'s version desynced from `manifest.json`'s | R1 only |
  | `manifest.json`'s `minAppVersion` changed without `versions.json` | R2 only |
  | `versions.json`'s `<manifest.version>` key deleted | R2 only |
  | the current `## [<version>]` heading renamed | R3 only |
  | that heading duplicated, so two exist | R3 only |
  | that heading's body emptied | R3 only |
  | that body replaced with a whitespace-only line | R3 only |

  The duplicate-heading row is not decorative: `release.yml`'s `p && /^## \[/ {exit}` stops at
  the second `## [`, so two headings for one version extract 0 bytes — the same silently-empty
  release this unit exists to prevent, reached by a different route.
- `ci.yml` runs `probe-git-log.mjs` in its own step and the remaining five in one further step,
  both between `Lint` and `Build`.
- `release.yml` fails the "Extract release notes" step when the extraction is empty, with a
  message naming the tag and the heading it looked for.

### Invariants

- **The probe never needs editing at a release.** Every assertion is phrased against
  `manifest.json`'s current value, so bumping the version cannot make the probe stale. An
  assertion that would need updating each release is out of scope by construction.
- **One parser, not two.** `release.yml` keeps sole ownership of how release notes are
  extracted; the probe asserts the condition that extraction depends on, and never mirrors its
  implementation.

- allowed-surface:
  - scripts/probe-release-metadata.mjs
  - .github/workflows/ci.yml
  - .github/workflows/release.yml
  - docs/specs/release-metadata-invariants.md
- refactor-scope:
  - (none)
