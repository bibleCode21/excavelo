# Review

How THOR's review runs in this repository. Parts not written here follow THOR's `review.md` unchanged.

## Test run

The full check is the steps CI runs (`.github/workflows/ci.yml`), from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm lint
rc=0; for p in scripts/probe-*.mjs; do node "$p" || { echo "FAILED: $p"; rc=1; }; done; test "$rc" -eq 0
pnpm build
test -f main.js && test -f manifest.json && test -f styles.css
```

- Run under Node 22.13 or newer, as CI does: the pnpm that `package.json` pins through `packageManager` refuses older Node, so every `pnpm` step fails there.
- The install comes first, even where the probes seem to run without it: the probes that bundle `src` import `esbuild`, and a worktree nested under the checkout finds the checkout's `node_modules` instead, which the commit under test may not match.
- The probes run by glob, so a new `scripts/probe-*.mjs` joins without editing this file; `scripts/probe-git-log/` holds that probe's modules and is not a probe itself.
- `probe-git-log.mjs` takes minutes; allow for it rather than cutting the run short.
- Unlike CI, which stops at the first failing probe, the loop runs every probe and fails the step at the end, so one failure does not hide another. Likewise run every step even after one fails.
- Report each step's exit status. A passing probe prints no totals, so for each probe report the number of its lines starting `  ok` and `  FAIL`, and its last line.
