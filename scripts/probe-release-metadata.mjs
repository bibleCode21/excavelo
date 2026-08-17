/**
 * Probe for the release metadata that has to agree before a tag is pushed —
 * run with `node scripts/probe-release-metadata.mjs`.
 *
 * Per docs/specs/release-metadata-invariants.md. Three files carry a version
 * between them and nothing checked that they agree. The third failure *was*
 * silent before this unit: .github/workflows/release.yml extracts release notes
 * by awk-matching `^## \[<tag>\]`, and `gh release create --notes-file` publishes
 * a 0-byte extraction as an empty release body while the workflow reports
 * success. The same unit added a guard to that step, so today an empty
 * extraction fails the release instead — this probe is the earlier of the two
 * lines of defence, catching it on a push rather than on a tag.
 *
 * Everything here is phrased against manifest.json's *current* value, so a
 * release never has to come back and edit this file — the same reasoning
 * probe-settings-tab.mjs:1086 already records for pinning minAppVersion but
 * not version. A version literal anywhere below would be a defect.
 *
 * R3 deliberately does not reimplement release.yml's awk: release.yml keeps
 * sole ownership of how notes are extracted, and this asserts the condition
 * that extraction depends on. Two details are load-bearing and come from the
 * awk's own semantics, stated once here and cited rather than restated below:
 *
 *   (H1) The version heading matches at **line start** — a real one carries a
 *        date suffix, `## [<version>] - <date>`, so this is a prefix test,
 *        never equality.
 *   (H2) The terminator is the same shape: the next line starting `## [`, i.e.
 *        another release's heading, ends this section.
 *   (W) "Not empty" means a line with a **non-whitespace character**: the trim
 *       is `awk 'NF{p=1} p'`, and a whitespace-only line has `NF == 0`, so such
 *       a body extracts to 0 bytes exactly as an absent one does.
 *
 * No esbuild and no source bundling: this reads the three metadata files,
 * CHANGELOG.md, ci.yml, and the probe-git-log entry and its modules as text, and
 * lists scripts/ and scripts/probe-git-log/. The mutation section below
 * also builds scratch trees and spawns child processes, which is the same
 * shape probe-git-log, probe-verify-chain and probe-transform-preservation
 * already use. No framework, same convention as the rest of this directory.
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

/**
 * Where the current version's section starts and what its body is — one
 * definition, used by R3 below and by the mutation harness further down, so
 * the two cannot drift apart.
 *
 * Heading per (H1), terminator per (H2). The body starts *after* the heading,
 * because release.yml's awk skips that line (`{p=1; next}`) — it is not part of
 * what gets published. Slicing from the heading instead would break this in the
 * opposite direction to the obvious guess: the terminator search would match the
 * heading at index 0, leaving an empty body and a check that fails on every
 * input.
 */
function sectionOf(allLines) {
  const headings = allLines.reduce(
    (acc, line, i) => (line.startsWith(`## [${version}]`) ? [...acc, i] : acc),
    []
  );
  if (headings.length !== 1) return { headings, body: null };
  const rest = allLines.slice(headings[0] + 1);
  const end = rest.findIndex((line) => line.startsWith("## ["));
  return { headings, body: end === -1 ? rest : rest.slice(0, end) };
}

const section = sectionOf(read("CHANGELOG.md").split("\n"));

check("R3 — exactly one CHANGELOG heading names the current version", () => {
  // No account of what the awk does with a second heading lives here: four were
  // written and measurement refuted all four.
  assert.equal(
    section.headings.length,
    1,
    `expected one line starting \`## [${version}]\` in CHANGELOG.md, found ${section.headings.length}`
  );
});

check("R3 — that heading's section carries something to publish", () => {
  assert.notEqual(section.body, null, "no single heading to read a section from");
  assert.ok(
    section.body.some((line) => /\S/.test(line)),
    `the \`## [${version}]\` section is empty — release.yml's empty-notes guard would fail the release`
  );
});

// --- recall additions (test-author, per-commit leg) — the mutation table -----
//
// The four checks above all assert that HEAD is well-formed, so predicates can
// be gutted underneath them and they keep printing `all passed`. Swap `/\S/`
// for `!== ""` and a whitespace-only section sails through (W); match the
// heading with `includes` instead of `startsWith` and an indented one does too
// (H1). Either way those four still report that everything is fine while no
// longer catching what they exist to catch. A checker whose only evidence is a
// green run on good input is indistinguishable from a vacuous one, and this
// repository's own §Why is that a silent failure deserves a mechanical guard.
//
// (Not every gutting is silent: slicing from the heading rather than after it
// makes the body check fail on every input, per sectionOf's note above. Those
// announce themselves. The two named above do not, which is what this section
// is for.)
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
  // reopens exactly that hole, and so does commenting an existing line out to
  // unblock a red build — the likelier accident of the two.
  //
  // This is feature envy and knowingly so: nothing it touches is release
  // metadata. It is here because this file is the only member of the contract's
  // allowed-surface that can hold it, following probe-settings-tab.mjs:1086,
  // which likewise parks a repo-level invariant in whichever probe stood
  // closest. Its home is a probe about the workflow itself, if one is ever
  // written. It is inside the env guard for its own reason, not the mutation
  // section's: a scratch copy has no `.github/` to read, so an unguarded check
  // would throw in every child and poison the red-set the harness reads back.
  //
  // A line-level test, not a substring one: `includes(name)` over the raw file
  // passes for a commented-out step, which is the accident above. Step *order*
  // is still deliberately not asserted — the contract's "both between Lint and
  // Build" would need this file to model the workflow's structure, and a second
  // model of ci.yml living here is the drift the "one parser, not two"
  // invariant rules out. Order is observed by the CI run.
  //
  // Two residues, both named rather than left to be discovered. The guard lives
  // inside the set it guards, so deleting this file deletes the check that would
  // have noticed. And a line test cannot see step-level YAML: `if: false` or
  // `continue-on-error: true` on the step keeps every invocation uncommented and
  // this check green, while the probes stop gating — the same accident by a
  // different keystroke. Catching those needs the structural model this file
  // refuses to build, so they belong to the workflow probe named above.
  const unwiredIn = (workflow, names) => {
    const live = workflow.split("\n").filter((line) => !line.trim().startsWith("#"));
    return names.filter((name) => !live.some((line) => line.includes(`node scripts/${name}`)));
  };

  check("every scripts/probe-*.mjs is run by an uncommented line in ci.yml", () => {
    const probes = fs
      .readdirSync(path.join(repoRoot, "scripts"))
      .filter((name) => name.startsWith("probe-") && name.endsWith(".mjs"))
      .sort();
    assert.notEqual(probes.length, 0, "found no probe scripts to look for");
    const unwired = unwiredIn(read(path.join(".github", "workflows", "ci.yml")), probes);
    assert.deepEqual(
      unwired,
      [],
      `ci.yml never runs ${unwired.join(", ")} — a probe the workflow does not invoke is` +
        ` checks that silently never run, the gap this contract closed for the four it had left out`
    );
  });

  // The comment filter is what makes the check above a line test rather than the
  // substring test it replaced, and against the real ci.yml — which has no
  // commented-out probe — dropping the filter changes nothing, so the check
  // cannot pin its own predicate. Synthetic input can, and needs no scratch tree.
  check("unwiredIn ignores a probe that only a comment mentions", () => {
    const one = ["probe-x.mjs"];
    assert.deepEqual(unwiredIn("          node scripts/probe-x.mjs", one), []);
    assert.deepEqual(unwiredIn("          # node scripts/probe-x.mjs", one), one);
    assert.deepEqual(unwiredIn("      # TODO re-enable node scripts/probe-x.mjs", one), one);
    assert.deepEqual(unwiredIn("          node scripts/probe-y.mjs", one), one);
  });

  // The anchor is `node scripts/${name}`, not bare `name` — item 27's finding
  // was that nothing pinned that difference: a line that only names the probe
  // (a step's `name:` field, a `paths:` filter) must still count as unwired.
  check("unwiredIn does not treat a bare name mention as wiring", () => {
    const one = ["probe-x.mjs"];
    assert.deepEqual(unwiredIn("          name: probe-x.mjs check", one), one);
  });

  // probe-git-log is the one subject split across files (an entry over
  // scripts/probe-git-log/), so it is the one place a module could grow its own
  // `failures` array and its own `check`. Nothing else here would notice: the run stays
  // green and byte-identical while that module quietly loses the ability to fail, which
  // is the opposite of what a probe is for. Same feature-envy note as the wiring check
  // above — it belongs to a probe about the probes, if one is ever written — and it is
  // inside the env guard for the same reason: a scratch copy has no scripts/probe-git-log/
  // to read, so an unguarded check would throw in every child and poison the red-set.
  //
  // Returns which clause fired rather than a boolean, so one red discriminates. It has to
  // be pinnable without a scratch tree, which is why it takes (path, source, wired) triples
  // and not a directory — the unwiredIn precedent above, for the same reason it gives.
  //
  // Every clause reads `withoutComments(src)`, never the raw source. A guard that reads raw text
  // cannot tell a call from prose mentioning one, nor a live import from a commented-out
  // one, and both mistakes were measured here: a `/* … */` around an `await import` read as
  // wiring, and the sentence "builders never call check()" in a docblock reddened the
  // wiring clause against the file it was describing. It is unwiredIn's own live-lines
  // idea, one level up and with block comments included. Not merged with unwiredIn: that
  // one strips YAML `#`, this one strips two JS comment forms, and one helper spanning
  // both grammars would be a worse thing to read than the seven characters they share.
  //
  // A block comment counts only when it *opens a line*. An unanchored `/*` is not safe
  // here: `branches:feature/*` is the dominant fixture idiom in these files, so `/` + `*`
  // occurs inside string literals, and an unanchored strip reads one as a comment opener
  // and runs to the next docblock's `*/`. Measured when this was first written that way —
  // it swallowed 285 lines of base-naming.mjs alone and hid 28 real `check(` calls from
  // the clauses below, which is the silent failure this guard exists to catch, produced by
  // the guard itself. Every real comment in the eight files opens its own line; no glob
  // does, so anchoring separates them without a parser.
  //
  // What it leaves, enumerated rather than parsed around: a `// …` or `/* … */` that starts
  // *after* code on the same line, and an `import { … }` hand-wrapped across lines (which
  // would make its module read as an orphan). One instance of the first exists —
  // caps-and-windows.mjs's `separatedStarsOut = e.message; // git.no-branches is an
  // acceptable outcome` — and it survives the strip harmlessly, carrying no `check(`, no
  // import and no binding. The other two do not occur: every import in the eight files is
  // on one line and this repo runs no formatter over `scripts/`. Closing any of them means
  // a JS parser, which is the
  // "one parser, not two" line this file already refuses to cross. The name says what it
  // does: it removes comments, it does not tokenize.
  //
  // Those three are the loud direction — leftover comment text only ever *adds* apparent
  // `check(` calls and bindings, which makes a clause fire. The silent direction, the one
  // the anchoring fixed, has one surface left: a line-opening `/*` inside a multi-line
  // template literal would still open a span. No instance exists (globs occur mid-line as
  // `feature/*`, never opening one), and it is the shape to check first if this ever hides
  // a module again.
  const withoutComments = (src) =>
    src.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, " ").replace(/^[ \t]*\/\/.*$/gm, "");

  const entryImports = (entrySrc, name) =>
    withoutComments(entrySrc).includes(`await import("./probe-git-log/${name}")`);

  const sharedHarnessBreaks = (files) => {
    const binds = (src, name) =>
      new RegExp(`^(?:function|const|let|var) ${name}\\b`, "m").test(withoutComments(src));
    // The *local* name, so `check as check2` does not count as bringing `check` into scope.
    const importedFromHarness = (src) => {
      const names = new Set();
      for (const m of withoutComments(src).matchAll(/^import \{([^}]*)\} from "\.[^"]*harness\.mjs";/gm)) {
        for (const part of m[1].split(",")) names.add(part.trim().split(/\s+as\s+/).pop().trim());
      }
      return names;
    };
    // "Runs checks it did not define" — the shape both clauses below are about. A binder is
    // exempt without naming a file: harness.mjs matches only because it declares the runner,
    // and fixtures.mjs calls none.
    const consumesCheck = (src) => /\bcheck\(/.test(withoutComments(src)) && !binds(src, "check");

    const broken = [];

    // Clauses 1-2. Any top-level binding spelling, not `function check(` alone: this codebase's
    // dominant idiom is `const f = (…) => …`, so a module writing `const check = (n, f) => …`
    // over its own accumulator is the likely accident, not an exotic one — and matching only
    // the declared form let exactly that shape through, measured, before this was widened.
    for (const name of ["failures", "check"]) {
      const binders = files.filter(([, src]) => binds(src, name));
      if (binders.length !== 1) broken.push(`${name} bound in ${binders.length} files`);
    }

    // Clause 3. Provenance: a module that runs checks must get the runner from the harness,
    // so its failures land in the one array the entry reads.
    const orphans = files.filter(([, src]) => consumesCheck(src) && !importedFromHarness(src).has("check"));
    if (orphans.length > 0) {
      broken.push(`check called without binding or importing it in ${orphans.map(([p]) => p).join(", ")}`);
    }

    // Clause 4, the other direction: a module can also be silenced by dropping one
    // `await import(...)` line from the entry, which takes its whole section with it —
    // measured at 182 ok -> 164 ok, tail `all passed`, exit 0, nothing else noticing. Both
    // spellings of that accident are covered (added and never wired, wired then unwired),
    // because the caller enumerates the directory rather than the entry. It asks about the
    // entry only, so a module the *modules* import — harness.mjs, fixtures.mjs — would be
    // reported unwired if it ever ran a check of its own. Neither does, and the report
    // would be loud rather than silent, so it is left as a known false-positive edge.
    const unwired = files.filter(([, src, wired]) => consumesCheck(src) && wired === false);
    if (unwired.length > 0) {
      broken.push(`checks never run — not imported by the entry: ${unwired.map(([p]) => p).join(", ")}`);
    }
    return broken;
  };

  check("the git-log probe's failure accumulator and check runner are shared, not per-module", () => {
    const dir = path.join("scripts", "probe-git-log");
    const entry = read(path.join("scripts", "probe-git-log.mjs"));
    const files = [
      ["scripts/probe-git-log.mjs", entry, true],
      ...fs
        .readdirSync(path.join(repoRoot, dir))
        .filter((name) => name.endsWith(".mjs"))
        .sort()
        .map((name) => [`${dir}/${name}`, read(path.join(dir, name)), entryImports(entry, name)]),
    ];
    // Three, not one: a listing of the entry alone reddens the two binding clauses on its
    // own, but the entry plus the harness passes every clause silently — every one of them
    // exempts the binder — so that is the degenerate listing this floor is for. Measured
    // both: 1 file gives ["failures bound in 0 files", "check bound in 0 files"], 2 gives [].
    assert.ok(files.length >= 3, `expected the entry and its modules; got ${files.length}`);
    assert.deepEqual(
      sharedHarnessBreaks(files),
      [],
      "a module with its own accumulator, or one the entry never imports, is green while unable to fail"
    );
  });

  // Every clause gets its own red, including the two shapes that defeated the first
  // version of this guard. A green-only pin would leave a clause free to be written
  // vacuously, which is the failure this whole guard exists to exclude.
  const H = ["harness.mjs", "const failures = [];\nfunction check(name, fn) {}\n", true];
  const A = ["a.mjs", 'import { check } from "./harness.mjs";\ncheck("x", () => {});\n', true];

  check("sharedHarnessBreaks pins each of its four clauses", () => {
    assert.deepEqual(sharedHarnessBreaks([H, A]), [], "the shared shape must be silent");
    assert.deepEqual(sharedHarnessBreaks([H, A, ["b.mjs", "const failures = [];\n", true]]), [
      "failures bound in 2 files",
    ]);
    assert.deepEqual(sharedHarnessBreaks([H, A, ["b.mjs", "function check(name, fn) {}\n", true]]), [
      "check bound in 2 files",
    ]);
    assert.deepEqual(sharedHarnessBreaks([H, A, ["b.mjs", 'check("x", () => {});\n', true]]), [
      "check called without binding or importing it in b.mjs",
    ]);
    assert.deepEqual(sharedHarnessBreaks([H, A, ["b.mjs", 'import { check } from "./harness.mjs";\ncheck("x", () => {});\n', false]]), [
      "checks never run — not imported by the entry: b.mjs",
    ]);
  });

  // `withoutComments` itself, which the clause pins cannot reach: their synthetic sources
  // carry no comments at all, so every one of them stays green with the block strip
  // deleted or left unterminated — measured, and that gap is how the unanchored version
  // shipped. Both directions get a red here: a comment must be removed, and code that
  // merely looks like one must not be. A *greedy* strip is the one mutation this does not
  // catch; the real-file check above does instead, loudly — greedy swallows harness.mjs's
  // own declarations, so the two binding clauses fire.
  check("withoutComments strips a line-opening block comment and nothing else", () => {
    const glob = 'const out = await tryLoad([`${repo} branches:feature/*`]);\ncheck("x", () => {});\n/**\n * next section\n */\n';
    assert.match(withoutComments(glob), /check\("x"/, "a glob's /* was read as a comment opener and swallowed real code");
    assert.doesNotMatch(withoutComments(glob), /next section/, "a line-opening block comment survived");
    assert.doesNotMatch(withoutComments("  /* await import(\"./probe-git-log/a.mjs\"); */\n"), /await import/);
    assert.match(withoutComments('const s = "a /* b */ c";\n'), /const s/, "an inline span took its own line with it");
  });

  // The same shape end to end, since the check above tests the helper and not its use:
  // a module whose only `check(` calls sit after a glob must still be seen to consume them.
  check("a glob-bearing module still reads as consuming check", () => {
    const globModule = [
      "b.mjs",
      'import { check } from "./harness.mjs";\nconst out = await tryLoad([`${repo} branches:feature/*`]);\ncheck("x", () => {});\n/**\n * trailer\n */\n',
      false,
    ];
    assert.deepEqual(sharedHarnessBreaks([H, A, globModule]), [
      "checks never run — not imported by the entry: b.mjs",
    ]);
  });

  // The `wired` input itself, since the real check takes it pre-computed. Against the real
  // entry — which has no commented-out import — the comment filter changes nothing, so that
  // check cannot pin its own predicate; synthetic input can, and needs no scratch tree.
  // This is the shape unwiredIn calls the likelier accident: a line commented out, not deleted.
  check("a commented-out await import does not count as wiring", () => {
    assert.equal(entryImports('await import("./probe-git-log/a.mjs");', "a.mjs"), true);
    assert.equal(entryImports('// await import("./probe-git-log/a.mjs");', "a.mjs"), false);
    assert.equal(entryImports('  //  await import("./probe-git-log/a.mjs");', "a.mjs"), false);
    assert.equal(entryImports('await import("./probe-git-log/b.mjs");', "a.mjs"), false);
  });

  // The two shapes the declaration-spelling version let through, kept as their own check
  // so a future narrowing of `binds` or `importedFromHarness` reddens here by name.
  check("sharedHarnessBreaks catches an arrow-spelled runner and an aliased import", () => {
    assert.deepEqual(sharedHarnessBreaks([H, A, ["b.mjs", "const check = (n, f) => {};\n", true]]), [
      "check bound in 2 files",
    ]);
    assert.deepEqual(
      sharedHarnessBreaks([
        H,
        A,
        ["b.mjs", 'import { check as check2 } from "./harness.mjs";\nconst errs = [];\ncheck("x", () => {});\n', true],
      ]),
      ["check called without binding or importing it in b.mjs"]
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
  // The section to mutate, located by the same sectionOf R3 uses — one
  // definition of where a section begins and ends, not two that must be kept in
  // step. `end` is absolute here because splice() wants absolute indices, while
  // sectionOf returns the body itself. Every row that locates its edit this way
  // is therefore blind to a gutted boundary — the edit shifts with it — which is
  // why the terminator has a row that does not come through here.
  const scratchSection = (dir) => {
    const all = fs.readFileSync(path.join(dir, "CHANGELOG.md"), "utf8").split("\n");
    const { headings, body } = sectionOf(all);
    assert.equal(headings.length, 1, "no single heading to mutate in the scratch CHANGELOG.md");
    return { all, at: headings[0], end: headings[0] + 1 + body.length };
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

  // Not a row of the contract's table: it pins (H1), which the table does not
  // reach. The renamed-heading row above passes just as well against an
  // `includes` heading match as against a `startsWith` one (`## [<v>-renamed]`
  // contains neither), so nothing else here holds the anchor — and losing it is
  // the silent direction. release.yml matches `^## \[`; a probe accepting an
  // indented heading would report the metadata fine while the extraction it
  // stands in for found no section at all.
  //
  // (H2) has its own row below — the tighter direction is silent, so arguing
  // only about the looser one (which can end the body early and merely turn the
  // check red) would have left the half that matters unpinned.
  check("mutation — a heading indented off line-start reddens R3 only", () => {
    const red = invariantsRedBy((dir) => {
      const { all, at } = scratchSection(dir);
      all[at] = ` ${all[at]}`;
      writeChangelog(dir, all);
    });
    assert.deepEqual(red, ["R3"]);
  });

  // The row that pins (H2), and the only one that cannot be built by mutating
  // the real CHANGELOG: every other row locates its edit through sectionOf, the
  // very definition under test, so a gutted terminator shifts the edit to match
  // and the two cancel out — measured, `startsWith("## [")` → `startsWith("### [")`
  // leaves all of the other rows green. This one writes a whole CHANGELOG whose
  // shape says what it means without reference to sectionOf: the current
  // version's section is empty, the next one is not. A correct terminator ends
  // the body at that next heading and reddens R3; a terminator that matches less
  // runs the body to EOF and passes the check on somebody else's release notes,
  // which is the silent direction (H1) and (W) are pinned against.
  check("mutation — an empty section above a non-empty one reddens R3 only", () => {
    const red = invariantsRedBy((dir) =>
      writeChangelog(dir, [
        "# Changelog",
        "",
        `## [${version}] - 2026-01-01`,
        "",
        // Derived, not a literal: `-earlier` cannot collide with the heading
        // above it, because the pattern carries the closing bracket.
        `## [${version}-earlier] - 2000-01-01`,
        "",
        "- an earlier release's notes, which are not this release's",
        "",
      ])
    );
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

  // The row that pins `/\S/` rather than `!== ""` — per (W) in the header. An
  // implementation testing for the empty string passes this input, which is why
  // the mutation is tabulated separately from the one above.
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
  // most of this file just vanished from an otherwise identical `all passed`. A
  // guard that drops checks quietly is the very thing this section exists to
  // make impossible, so it says so. Neither counted nor enumerated: a count went
  // stale the moment a row was added, and the enumeration that replaced it went
  // stale one commit later. What is stable is where the boundary is.
  console.log(`  (skipped — ${CHILD_ENV} is set: every check below the guard)`);
}

if (failures.length > 0) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
