# Review

How THOR's review runs in this repository. Parts not written here follow THOR's `review.md` unchanged.

## Test run

The full check is what CI runs (`.github/workflows/ci.yml`), from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm lint
for p in scripts/probe-*.mjs; do node "$p" || echo "FAILED: $p"; done
pnpm build
```

- Run under Node 22.13 or newer, as CI does: the pnpm that `package.json` pins through `packageManager` refuses older Node, so every `pnpm` step fails there.
- The install comes first, even where the probes seem to run without it: every probe except `probe-release-metadata.mjs` needs `esbuild`, and a worktree nested under the checkout finds the checkout's `node_modules` instead, which the commit under test may not match.
- The probes run by glob, so a new `scripts/probe-*.mjs` joins without editing this file; `scripts/probe-git-log/` holds that probe's modules and is not a probe itself.
- `probe-git-log.mjs` takes minutes; allow for it rather than cutting the run short.
- Run every step even after one fails, and report each step's outcome and each probe's counts as printed.
