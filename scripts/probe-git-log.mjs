/**
 * Probe for src/core/git-log.ts and src/core/prompt.ts — run with
 * `node scripts/probe-git-log.mjs`.
 *
 * No test runner exists (package.json declares lint and build only), and
 * git-log.ts imports `obsidian` at module top, so it cannot be required from
 * plain node. This script esbuild-bundles the modules with an `obsidian` stub
 * and asserts against the bundle with node:assert. No framework, no new
 * dependency — esbuild is already a devDependency.
 *
 * Covers the work contract's acceptance criteria A1-A16 and invariants I1-I4
 * (docs/specs/git-log-master-source.md). A1-A8 run against buildFixture(),
 * which carries every merge shape the contract names; A9 calls buildPrompt on
 * a hand-built context (prompt.ts imports types only); A11 needs more than
 * MAX_BRANCHES named landings and gets its own fixture.
 *
 * Fixture dates are fixed ISO instants in 2024. Author and committer dates are
 * set apart where the contract distinguishes them (the window and a landing
 * header use the committer date; per-commit lines render the author date).
 *
 * **A window boundary must carry a time of day whenever its date is also a
 * fixture commit's date.** git's approxidate fills a bare `YYYY-MM-DD` from the
 * *current* time of day, not from midnight, so `since:2024-01-01` against a
 * commit at `2024-01-01T12:00:00Z` includes it in the morning and drops it in
 * the evening. This is not theoretical — it took B7 red on a CI runner and on
 * this machine after 21:00 KST, having been green all day. Every boundary that
 * collides with a fixture date is pinned to an explicit instant below
 * (`T00:00:00Z` for `since:`, `T23:59:59Z` for `until:`, both meaning "the
 * commit dated that day is inside the window"); boundaries on dates no fixture
 * uses are left bare, since nothing can straddle them.
 */

/**
 * Layout: the checks live in ./probe-git-log/, one module per fixture cluster, run
 * below in the order they must run. The awaited import sequence *is* that order:
 * every one of those modules has top-level `await`, and a static import list would
 * only start them in order — the first to await would yield and let the next one
 * print into the gap. Awaiting each in turn makes the order total. A handle a later
 * module reuses is a named import rather than a binding some hundreds of lines up;
 * harness.mjs holds the check runner and the bundle, fixtures.mjs the builders.
 *
 * The rules stated above govern those modules, not this file — the window-boundary
 * requirement most of all: it binds wherever a fixture date and a boundary meet,
 * which is now every module under ./probe-git-log/. Positional wording in the
 * comments there ("above", "below", "this file") predates the split and was left
 * verbatim, so that the move could be proved by byte-identical output — except
 * where such a claim was load-bearing for safety rather than for navigation, which
 * is corrected in place (confirmation.mjs's spawn stub is the one case).
 */
import fs from "node:fs";

import { failures, tmp } from "./probe-git-log/harness.mjs";

await import("./probe-git-log/selection-and-traversal.mjs");
await import("./probe-git-log/marker-spoofing.mjs");
await import("./probe-git-log/caps-and-windows.mjs");
await import("./probe-git-log/confirmation.mjs");
await import("./probe-git-log/base-naming.mjs");

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
