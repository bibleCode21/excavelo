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
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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
  // After the heading, not from it — because release.yml's awk skips the
  // heading line (`{p=1; next}`), so it is not part of what gets published.
  // Slicing from it would also break this check in the opposite direction to
  // the obvious guess: the terminator search would match the heading at index
  // 0, leaving an empty body and a check that fails on every input.
  const rest = lines.slice(headingIndexes[0] + 1);
  const end = rest.findIndex((line) => line.startsWith("## ["));
  const body = end === -1 ? rest : rest.slice(0, end);
  assert.ok(
    body.some((line) => /\S/.test(line)),
    `the \`## [${version}]\` section is empty — release.yml would publish a release with no notes and still report success`
  );
});

// --- recall additions (test-author, per-commit leg) — the mutation table -----
//
// The four checks above all assert that HEAD is well-formed, so every one of
// them survives this file's predicates being gutted. Swap `/\S/` for `!== ""`,
// or slice *from* the heading instead of after it, and this probe still prints
// `all passed` — while no longer catching the empty release body it exists to
// catch. A checker whose only evidence is a green run on good input is
// indistinguishable from a vacuous one, and this repository's own §Why is that
// a silent failure deserves a mechanical guard.
//
// The contract's mutation table (§Spec, acceptance criteria) is the oracle that
// does distinguish them. It was demonstrated by hand once, on scratch copies,
// when this file was written; nothing re-ran it after. These checks do, on
// every run.
//
// This is not a test of a test, because it terminates. Each check below asserts
// *which* invariants a mutation reddens, so a mutation that stops biting — a
// slice that drifted, a heading no longer where it was — reddens nothing or the
// wrong thing, mismatches its expected set, and fails loud. The failure mode
// the checks above have (silently stop discriminating, stay green) is not
// available to a check whose expectation is a red.
//
// A copy resolves its own repoRoot from its own location, so a scratch tree of
// the four metadata files plus this file is already a complete, runnable probe:
// no injection point is needed, and no version literal appears here either —
// every mutation is derived from manifest.json's current values, so this
// section stays as release-proof as the rest of the file. The copy runs with
// CHILD_ENV set, so it evaluates R1-R3 and not this section.
const CHILD_ENV = "PROBE_RELEASE_METADATA_CHILD";

if (!process.env[CHILD_ENV]) {
  // SC2 — "ci.yml runs all six probes" — has no guard either, and the failure
  // it leaves open is the one this unit was created to remove: ci.yml ran one
  // probe of five, so 241 of 423 checks never saw a push or a pull request,
  // silently, for as long as it took someone to notice. Adding a seventh probe
  // reopens exactly that hole. This file is the only member of the contract's
  // allowed-surface that can hold the check; the nearest precedent is
  // probe-settings-tab.mjs:1086, which likewise parks a repo-level invariant in
  // whichever probe stood closest.
  //
  // Step *order* is deliberately not asserted. The contract's "both between
  // Lint and Build" would need this file to model the workflow's structure, and
  // a second model of ci.yml living here is the drift that the "one parser, not
  // two" invariant rules out for release.yml. Order is observed by the CI run.
  check("every scripts/probe-*.mjs is named in ci.yml", () => {
    const workflow = read(path.join(".github", "workflows", "ci.yml"));
    const probes = fs
      .readdirSync(path.join(repoRoot, "scripts"))
      .filter((name) => name.startsWith("probe-") && name.endsWith(".mjs"))
      .sort();
    assert.notEqual(probes.length, 0, "found no probe scripts to look for");
    const unwired = probes.filter((name) => !workflow.includes(name));
    assert.deepEqual(
      unwired,
      [],
      `ci.yml never runs ${unwired.join(", ")} — a probe absent from the workflow is` +
        ` checks that silently never run, the gap this contract closed for five of them`
    );
  });

  const probeFile = fileURLToPath(import.meta.url);
  const metadataFiles = ["manifest.json", "package.json", "versions.json", "CHANGELOG.md"];

  // The invariants ("R1"/"R2"/"R3") a scratch copy reddens under `mutate`, read
  // off the copy's own FAIL lines. Every check name begins with its invariant,
  // which is what lets one mutation redden both R3 checks and still count as
  // "R3 only" — the contract ranges "and no other" over invariants, not over
  // individual check() lines.
  function invariantsRedBy(mutate) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "probe-release-metadata-"));
    try {
      fs.mkdirSync(path.join(dir, "scripts"));
      for (const name of metadataFiles) {
        fs.copyFileSync(path.join(repoRoot, name), path.join(dir, name));
      }
      const copy = path.join(dir, "scripts", path.basename(probeFile));
      fs.copyFileSync(probeFile, copy);
      mutate(dir);
      const run = spawnSync(process.execPath, [copy], {
        encoding: "utf8",
        env: { ...process.env, [CHILD_ENV]: "1" },
      });
      assert.equal(run.error, undefined, `could not run the scratch copy: ${run.error}`);
      const red = [
        ...new Set(
          run.stdout
            .split("\n")
            .filter((line) => line.startsWith("  FAIL "))
            .map((line) => line.slice("  FAIL ".length).split(" ")[0])
        ),
      ].sort();
      // Exit status and FAIL lines have to agree, or the thing that ran is not
      // the probe this file thinks it copied.
      assert.equal(
        run.status,
        red.length > 0 ? 1 : 0,
        `scratch copy exited ${run.status} with ${red.length} reddened invariant(s):\n${run.stdout}${run.stderr}`
      );
      return red;
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  const mutateJson = (dir, name, edit) => {
    const value = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    edit(value);
    fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, "\t"));
  };
  // The section to mutate, located the way release.yml locates it. If this ever
  // finds the wrong lines the mutation misfires and its check goes red — which
  // is the point: a mutation harness fails loud, it cannot rot quiet.
  const scratchSection = (dir) => {
    const all = fs.readFileSync(path.join(dir, "CHANGELOG.md"), "utf8").split("\n");
    const at = all.findIndex((line) => line.startsWith(`## [${version}]`));
    assert.notEqual(at, -1, "no heading to mutate in the scratch CHANGELOG.md");
    const next = all.slice(at + 1).findIndex((line) => line.startsWith("## ["));
    return { all, at, end: next === -1 ? all.length : at + 1 + next };
  };
  const writeChangelog = (dir, lines) =>
    fs.writeFileSync(path.join(dir, "CHANGELOG.md"), lines.join("\n"));

  check("mutation — an unmutated scratch copy still passes (the copy is faithful)", () => {
    assert.deepEqual(invariantsRedBy(() => {}), []);
  });

  check("mutation — package.json's version desynced reddens R1 only", () => {
    const red = invariantsRedBy((dir) =>
      mutateJson(dir, "package.json", (pkg) => {
        pkg.version = `${version}-desynced`;
      })
    );
    assert.deepEqual(red, ["R1"]);
  });

  check("mutation — manifest.json's minAppVersion changed alone reddens R2 only", () => {
    const red = invariantsRedBy((dir) =>
      mutateJson(dir, "manifest.json", (m) => {
        m.minAppVersion = `${m.minAppVersion}-raised`;
      })
    );
    assert.deepEqual(red, ["R2"]);
  });

  check("mutation — versions.json's entry for this version deleted reddens R2 only", () => {
    const red = invariantsRedBy((dir) =>
      mutateJson(dir, "versions.json", (versions) => {
        delete versions[version];
      })
    );
    assert.deepEqual(red, ["R2"]);
  });

  check("mutation — the current heading renamed reddens R3 only", () => {
    const red = invariantsRedBy((dir) => {
      const { all, at } = scratchSection(dir);
      all[at] = all[at].replace(`## [${version}]`, `## [${version}-renamed]`);
      writeChangelog(dir, all);
    });
    assert.deepEqual(red, ["R3"]);
  });

  // Not a row of the contract's table, but the §Spec sentence the table does
  // not reach: "Both predicates match at line start." The renamed-heading row
  // above passes just as well against a `includes` heading match as against a
  // `startsWith` one (`## [<v>-renamed]` contains neither), so nothing else
  // here pins the anchor — and losing it is the silent direction. release.yml
  // matches `^## \[`; a probe that accepted an indented heading would report
  // metadata fine while the extraction it stands in for found no section and
  // published an empty body, which is the failure this unit exists to prevent.
  check("mutation — a heading indented off line-start reddens R3 only", () => {
    const red = invariantsRedBy((dir) => {
      const { all, at } = scratchSection(dir);
      all[at] = ` ${all[at]}`;
      writeChangelog(dir, all);
    });
    assert.deepEqual(red, ["R3"]);
  });

  check("mutation — the current heading duplicated reddens R3 only", () => {
    const red = invariantsRedBy((dir) => {
      const { all, at } = scratchSection(dir);
      all.splice(at, 0, all[at], "");
      writeChangelog(dir, all);
    });
    assert.deepEqual(red, ["R3"]);
  });

  check("mutation — the current section's body emptied reddens R3 only", () => {
    const red = invariantsRedBy((dir) => {
      const { all, at, end } = scratchSection(dir);
      all.splice(at + 1, end - at - 1);
      writeChangelog(dir, all);
    });
    assert.deepEqual(red, ["R3"]);
  });

  // The row that pins `/\S/` rather than `!== ""`: `awk 'NF{p=1} p'` gives a
  // whitespace-only line NF == 0, so it extracts to 0 bytes exactly as an
  // absent body does. An implementation testing for the empty string passes
  // this input, which is why the mutation is tabulated separately from the one
  // above.
  check("mutation — that body replaced with a whitespace-only line reddens R3 only", () => {
    const red = invariantsRedBy((dir) => {
      const { all, at, end } = scratchSection(dir);
      all.splice(at + 1, end - at - 1, "   ");
      writeChangelog(dir, all);
    });
    assert.deepEqual(red, ["R3"]);
  });
} else {
  // Reached on every scratch copy, whose stdout only the parent reads. Reached
  // by a human only if this variable leaked into a real shell — in which case
  // nine checks just vanished from an otherwise identical `all passed`, and a
  // guard that drops checks quietly is the very thing this section exists to
  // make impossible.
  console.log(`  (mutation checks skipped — ${CHILD_ENV} is set)`);
}

if (failures.length > 0) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
