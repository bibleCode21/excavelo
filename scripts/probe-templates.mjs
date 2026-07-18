/**
 * Probe for src/core/templates.ts — run with `node scripts/probe-templates.mjs`.
 *
 * Characterization safety net for docs/specs/templates-frontmatter-type-narrowing.md
 * (WU-4): templates.ts had no automated coverage before this contract. The
 * contract narrows FrontmatterParsed/splitFrontmatter/parseYamlScalar's type
 * signatures from `unknown` to the actual `null | boolean | number | string`
 * they can ever produce — a type-only change, so this probe is meant to be
 * green both before and after that change; it locks TemplateRegistry.parse()'s
 * runtime output, not a currently-broken behavior.
 *
 * splitFrontmatter/parseYamlScalar are module-private, so coverage goes
 * through the public TemplateRegistry.parse() (TS `private` is erased at
 * runtime — esbuild's output lets this script call it directly).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import esbuild from "esbuild";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "probe-templates-"));

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
async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failures.push({ name, e });
    console.log(`  FAIL ${name}\n       ${String(e.message).split("\n").join("\n       ")}`);
  }
}

function loadModule() {
  const stub = path.join(tmp, "obsidian-stub.js");
  const entry = path.join(tmp, "entry.ts");
  const out = path.join(tmp, "bundle.cjs");
  fs.writeFileSync(
    stub,
    "export class TFile {}\n" +
      "export class TFolder {}\n" +
      "export class App {}\n" +
      'export function normalizePath(p) { return p.replace(/\\\\/g, "/").replace(/\\/+/g, "/"); }\n'
  );
  fs.writeFileSync(
    entry,
    `export { TemplateRegistry } from ${JSON.stringify(path.join(repoRoot, "src/core/templates"))};\n` +
      `export { STARTER_TEMPLATES } from ${JSON.stringify(path.join(repoRoot, "src/core/starter-templates"))};\n`
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

const { TemplateRegistry, STARTER_TEMPLATES } = loadModule();

/** A TemplateRegistry whose vault.read() always returns `raw` for any file. */
function registryFor(raw) {
  const app = { vault: { read: async () => raw } };
  return new TemplateRegistry(app, "templates");
}

const fakeFile = { basename: "my-template", path: "templates/my-template.md", extension: "md" };

// --- 1. Normal frontmatter: string / number / boolean / null values ---

await checkAsync("string frontmatter values pass through unchanged", async () => {
  const raw = "---\nname: My Template\ndescription: A nice template\nicon: star\n---\n\nbody text\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t.name, "My Template");
  assert.equal(t.description, "A nice template");
  assert.equal(t.icon, "star");
});

await checkAsync("number frontmatter value stringifies via String()", async () => {
  const raw = "---\nname: 42\n---\n\nbody\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t.name, "42");
});

await checkAsync("falsy boolean/null frontmatter values take the fallback branch, not String()", async () => {
  // description_ko: false and model: null both take the falsy-fallback branch
  // (`frontmatter.X ? String(...) : undefined/null`), not the String(false) path —
  // characterizing that branch choice, not the truthy String() call (see next check).
  const raw = "---\nname: t\ndescription_ko: false\nmodel: null\n---\n\nbody\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t.descriptionKo, undefined);
  assert.equal(t.model, null);
});

await checkAsync("a truthy boolean frontmatter value actually reaches String()", async () => {
  const raw = "---\nname: t\nicon: true\n---\n\nbody\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t.icon, "true");
});

// --- 2. Block scalar (`key: |`, `key: |-`) parsing ---

await checkAsync("block scalar (|) joins indented lines with no trailing newline (this naive parser's actual behavior — real YAML | keeps one)", async () => {
  const raw = "---\nname: t\nnew_note_scaffold: |\n  line one\n  line two\n---\n\nbody\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t.newNoteScaffold, "line one\nline two");
});

await checkAsync("block scalar (|-) strips trailing newline", async () => {
  const raw = "---\nname: t\nnew_note_scaffold: |-\n  line one\n  line two\n---\n\nbody\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t.newNoteScaffold, "line one\nline two");
});

await checkAsync("block scalar preserves a blank line inside the block", async () => {
  const raw = "---\nname: t\nnew_note_scaffold: |\n  line one\n\n  line two\n---\n\nbody\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t.newNoteScaffold, "line one\n\nline two");
});

// --- 3. No frontmatter ---

await checkAsync("a file with no frontmatter block returns null from parse()", async () => {
  const raw = "just a plain markdown file, no frontmatter\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t, null);
});

// --- 4. Every Template field TemplateRegistry.parse() maps, present and absent ---

await checkAsync("every String()-sourced field maps when present in frontmatter", async () => {
  const raw =
    "---\n" +
    "name: full-name\n" +
    "description: full-description\n" +
    "description_ko: full-description-ko\n" +
    "icon: full-icon\n" +
    "model: full-model\n" +
    "output_folder: full-output-folder\n" +
    "output_filename: full-output-filename\n" +
    "new_note_folder: full-new-note-folder\n" +
    "new_note_filename: full-new-note-filename\n" +
    "new_note_scaffold: full-new-note-scaffold\n" +
    "---\n\nbody\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t.name, "full-name");
  assert.equal(t.description, "full-description");
  assert.equal(t.descriptionKo, "full-description-ko");
  assert.equal(t.icon, "full-icon");
  assert.equal(t.model, "full-model");
  assert.equal(t.outputFolder, "full-output-folder");
  assert.equal(t.outputFilename, "full-output-filename");
  assert.equal(t.newNoteFolder, "full-new-note-folder");
  assert.equal(t.newNoteFilename, "full-new-note-filename");
  assert.equal(t.newNoteScaffold, "full-new-note-scaffold");
});

await checkAsync("absent optional fields fall back per field (undefined/null/file.basename)", async () => {
  const raw = "---\ndescription: only this is set\n---\n\nbody\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t.name, fakeFile.basename, "name falls back to file.basename");
  assert.equal(t.description, "only this is set");
  assert.equal(t.descriptionKo, undefined);
  assert.equal(t.icon, undefined);
  assert.equal(t.model, null);
  assert.equal(t.outputFolder, undefined);
  assert.equal(t.outputFilename, undefined);
  assert.equal(t.newNoteFolder, undefined);
  assert.equal(t.newNoteFilename, undefined);
  assert.equal(t.newNoteScaffold, undefined);
});

await checkAsync("absent description falls back to empty string", async () => {
  const raw = "---\nname: t\n---\n\nbody\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t.description, "");
});

// spec-review WARN: hotkey/provider/output are cast (not String()-sourced) but
// read from the same narrowed frontmatter object — cover them too.
await checkAsync("hotkey/provider/output (cast-based fields) map when present", async () => {
  const raw = "---\nname: t\nhotkey: mod+shift+t\nprovider: anthropic-api\noutput: new-file\n---\n\nbody\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t.hotkey, "mod+shift+t");
  assert.equal(t.provider, "anthropic-api");
  assert.equal(t.output, "new-file");
});

await checkAsync("hotkey/provider/output fall back when absent", async () => {
  const raw = "---\nname: t\n---\n\nbody\n";
  const t = await registryFor(raw).parse(fakeFile);
  assert.equal(t.hotkey, null);
  assert.equal(t.provider, null);
  assert.equal(t.output, "preview-first");
});

// --- 5. All 8 bundled STARTER_TEMPLATES parse cleanly end-to-end ---

check("STARTER_TEMPLATES has exactly 8 entries", () => {
  assert.equal(STARTER_TEMPLATES.length, 8);
});

for (const starter of STARTER_TEMPLATES) {
  await checkAsync(`starter template "${starter.filename}" parses with a non-empty name and instruction`, async () => {
    const file = { basename: starter.filename.replace(/\.md$/, ""), path: `templates/${starter.filename}`, extension: "md" };
    const t = await registryFor(starter.content).parse(file);
    assert.ok(t, `${starter.filename} produced no Template (frontmatter block missing?)`);
    assert.ok(t.name.length > 0, `${starter.filename}: name is empty`);
    assert.ok(t.instruction.length > 0, `${starter.filename}: instruction is empty`);
  });
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
