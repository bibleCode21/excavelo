/**
 * Probe for the release metadata that has to agree before a tag is pushed —
 * run with `node scripts/probe-release-metadata.mjs`.
 *
 * Per docs/specs/release-metadata-invariants.md. Three files carry a version
 * between them and nothing checked that they agree; the third failure is
 * silent, because .github/workflows/release.yml extracts release notes by
 * awk-matching `^## \[<tag>\]` and `gh release create --notes-file` publishes a
 * 0-byte extraction as an empty release body while the workflow reports
 * success.
 *
 * Everything here is phrased against manifest.json's *current* value, so a
 * release never has to come back and edit this file — the same reasoning
 * probe-settings-tab.mjs:1086 already records for pinning minAppVersion but
 * not version. A version literal anywhere below would be a defect.
 *
 * R3 deliberately does not reimplement release.yml's awk: release.yml keeps
 * sole ownership of how notes are extracted, and this asserts the condition
 * that extraction depends on. Two details are load-bearing and come from the
 * awk's own semantics — headings match at line start (a real heading carries a
 * date suffix, `## [1.5.0] - 2026-08-02`), and "not empty" means a line with a
 * non-whitespace character, because `awk 'NF{p=1} p'` leaves a whitespace-only
 * body at 0 bytes just as an absent one.
 *
 * No esbuild, no fixtures — this reads four files. No framework, same
 * convention as the other probes in this directory.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(repoRoot, name), "utf8");
const readJson = (name) => JSON.parse(read(name));

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

const manifest = readJson("manifest.json");
const version = manifest.version;

console.log("release metadata (R1-R3)");

check("R1 — package.json's version matches manifest.json's", () => {
  assert.equal(
    readJson("package.json").version,
    version,
    `package.json and manifest.json disagree on the version — a release publishes manifest.json, so this desync ships`
  );
});

check("R2 — versions.json maps this version to manifest.json's minAppVersion", () => {
  const versions = readJson("versions.json");
  assert.ok(
    Object.hasOwn(versions, version),
    `versions.json has no entry for ${version} — Obsidian resolves the update through this map, so a version missing from it is one nobody is offered`
  );
  assert.equal(
    versions[version],
    manifest.minAppVersion,
    `versions.json says ${version} needs Obsidian ${versions[version]}, manifest.json says ${manifest.minAppVersion}`
  );
});

// The heading and the terminator are both line-start tests, not line equality:
// a real heading carries a date suffix. `## [` is the terminator release.yml
// itself uses, so a *different* release's heading ends this one's section.
const lines = read("CHANGELOG.md").split("\n");
const headingIndexes = lines.reduce(
  (acc, line, i) => (line.startsWith(`## [${version}]`) ? [...acc, i] : acc),
  []
);

check("R3 — exactly one CHANGELOG heading names the current version", () => {
  assert.equal(
    headingIndexes.length,
    1,
    `expected one line starting \`## [${version}]\` in CHANGELOG.md, found ${headingIndexes.length}` +
      ` — release.yml's extraction stops at the second \`## [\`, so none and two both yield 0 bytes`
  );
});

check("R3 — that heading's section carries something to publish", () => {
  assert.equal(headingIndexes.length, 1, "no single heading to read a section from");
  // After the heading, not from it: counting the heading itself would let it
  // supply the non-whitespace and make this unfailable.
  const rest = lines.slice(headingIndexes[0] + 1);
  const end = rest.findIndex((line) => line.startsWith("## ["));
  const body = end === -1 ? rest : rest.slice(0, end);
  assert.ok(
    body.some((line) => /\S/.test(line)),
    `the \`## [${version}]\` section is empty — release.yml would publish a release with no notes and still report success`
  );
});

if (failures.length > 0) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
