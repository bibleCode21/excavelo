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

- The install comes first even where `node_modules` looks present: every probe except `probe-release-metadata.mjs` needs `esbuild`, and a fresh worktree has no `node_modules`.
- The probes run by glob, so a new `scripts/probe-*.mjs` joins without editing this file; `scripts/probe-git-log/` holds that probe's modules and is not a probe itself.
- `probe-git-log.mjs` takes minutes; allow for it rather than cutting the run short.
- Run every step even after one fails, and report each step's outcome and each probe's counts as printed.
