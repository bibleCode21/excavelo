/**
 * Probe for src/core/git-log.ts — run with `node scripts/probe-git-log.mjs`.
 *
 * No test runner exists (package.json declares lint and build only), and
 * git-log.ts imports `obsidian` at module top, so it cannot be required from
 * plain node. This script esbuild-bundles the module with an `obsidian` stub
 * and asserts against the bundle with node:assert. No framework, no new
 * dependency — esbuild is already a devDependency.
 *
 * Scope today: A10 — the preserved pure surfaces (parseGitSpec,
 * branchCandidates, globToRegExp). A1-A9 and A11 need a fixture repository
 * carrying the merge shapes and belong to the implementation step; the
 * fixture/bundle/check helpers below are the seam for that.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import esbuild from "esbuild";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "probe-git-log-"));

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.log(`  FAIL ${name}\n       ${String(e.message).split("\n").join("\n       ")}`);
  }
}

/**
 * Bundle git-log.ts with `obsidian` aliased to a stub. `t` is re-exported
 * alongside so error assertions can pin the i18n *key* rather than the
 * English wording — the contract preserves the key, not the text.
 */
function loadModule() {
  const stub = path.join(tmp, "obsidian-stub.js");
  const entry = path.join(tmp, "entry.ts");
  const out = path.join(tmp, "bundle.cjs");
  fs.writeFileSync(stub, "export const Platform = { isMobile: false };\n");
  fs.writeFileSync(
    entry,
    `export * from ${JSON.stringify(path.join(repoRoot, "src/core/git-log"))};\n` +
      `export { t } from ${JSON.stringify(path.join(repoRoot, "src/i18n"))};\n`
  );
  esbuild.buildSync({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: out,
    alias: { obsidian: stub },
    logLevel: "warning",
  });
  return createRequire(import.meta.url)(out);
}

/** Branch names only — the commit shapes A1-A11 need are not built here. */
function buildFixture() {
  const repo = path.join(tmp, "repo");
  fs.mkdirSync(repo);
  const git = (...args) =>
    execFileSync("git", ["-C", repo, "-c", "user.name=probe", "-c", "user.email=probe@example.com", "-c", "commit.gpgsign=false", ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  git("commit", "-q", "--allow-empty", "-m", "base");
  for (const b of ["feature/2026/a/b", "probe/xy", "probe/axb"]) git("branch", b);
  return repo;
}

const mod = loadModule();
const { parseGitSpec, branchCandidates, loadGitLog, t } = mod;

console.log("parseGitSpec");

check("A10 — path with spaces + since:7d + until:today + branches:", () => {
  assert.deepEqual(
    parseGitSpec("D:/my git/excavelo repo since:7d until:today branches:feature/2026/*"),
    { path: "D:/my git/excavelo repo", since: "7 days ago", until: "midnight", branches: "feature/2026/*" }
  );
});

check("ISO dates pass through unchanged", () => {
  assert.deepEqual(parseGitSpec("/r since:2026-07-01 until:2026-07-05"), {
    path: "/r",
    since: "2026-07-01",
    until: "2026-07-05",
    branches: null,
  });
});

check("branch: is an alias for branches:", () => {
  assert.equal(parseGitSpec("/r branch:feature/x").branches, "feature/x");
});

check("bare path — no tokens, all null", () => {
  assert.deepEqual(parseGitSpec("  /r/some path  "), {
    path: "/r/some path",
    since: null,
    until: null,
    branches: null,
  });
});

console.log("branchCandidates");

check("a slash is required", () => {
  assert.deepEqual(branchCandidates("noslash feature/x"), ["feature/x"]);
});

check("git-ref charset only — tildes and URLs rejected", () => {
  assert.deepEqual(branchCandidates("feat~ure/x https://example.com/a"), []);
});

check("surrounding brackets, quotes and punctuation stripped", () => {
  assert.deepEqual(branchCandidates("(feature/a) 'feature/b', *feature/c*"), [
    "feature/a",
    "feature/b",
    "feature/c",
  ]);
});

check("//, leading and trailing slashes rejected", () => {
  assert.deepEqual(branchCandidates("a//b /lead trail/"), []);
});

check("duplicates collapsed", () => {
  assert.deepEqual(branchCandidates("feature/x feature/x"), ["feature/x"]);
});

/**
 * globToRegExp is not exported. Its only observable path is loadGitLog's
 * `branches:<glob>` filter, which throws git.no-branches when zero branches
 * match — upstream of the commit selection this contract replaces, so these
 * assertions do not pin behavior that is the deliverable to remove.
 */
console.log("globToRegExp (via loadGitLog branches: filter)");

const repo = buildFixture();
// Branches present: main, feature/2026/a/b, probe/xy, probe/axb.
const matches = async (glob) => {
  try {
    await loadGitLog([`${repo} branches:${glob}`]);
    return true;
  } catch (e) {
    if (e.message === t("git.no-branches", { glob, path: repo })) return false;
    throw e;
  }
};

const globCases = [
  ["feature/2026/* — * crosses slashes", "feature/2026/*", true],
  ["probe/x? — ? matches one character", "probe/x?", true],
  ["probe/xy? — ? is not zero characters", "probe/xy?", false],
  ["probe/? — ? is not many characters", "probe/?", false],
  ["probe/a.b — regex metacharacters escaped", "probe/a.b", false],
  ["PROBE/XY — case-insensitive", "PROBE/XY", true],
];

for (const [name, glob, expected] of globCases) {
  let actual;
  try {
    actual = await matches(glob);
  } catch (e) {
    failures.push({ name, e });
    console.log(`  FAIL ${name}\n       ${e.message}`);
    continue;
  }
  check(name, () => assert.equal(actual, expected, `glob ${glob}: expected match=${expected}`));
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
