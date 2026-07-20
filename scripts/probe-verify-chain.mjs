/**
 * Contract probe for docs/specs/completeness-verify-chain.md §Spec — run with
 * `node scripts/probe-verify-chain.mjs`.
 *
 * Written red-first: asserts the verify→repair chain's parsing, branching,
 * degenerate-output guard, and prompt assembly before src/core/verify.ts
 * exists. Same convention as probe-git-log.mjs / probe-transform-preservation.mjs:
 * esbuild bundle + obsidian stub + node:assert, no test runner.
 *
 * Preserved-surface behavior (toggle-OFF path, gitLog-skip call count, prompt
 * assembly of the FIRST call) is probe-transform-preservation.mjs's job — this
 * file covers only the NEW chain behavior.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "probe-verify-chain-"));

globalThis.window ??= { setTimeout, clearTimeout };

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

// --- obsidian stub (TransformRunner-level checks) --------------------------

const STUB_SOURCE = `
export class Notice { constructor(message) { this.message = message; } }
export class Editor {}
export const Platform = { isMobile: false, isDesktop: true };
export function getLanguage() { return "en"; }
export function requireApiVersion(_version) { return true; }
`;

function loadModule() {
  const stub = path.join(tmp, "obsidian-stub.js");
  const entry = path.join(tmp, "entry.ts");
  const out = path.join(tmp, "bundle.cjs");
  fs.writeFileSync(stub, STUB_SOURCE);
  fs.writeFileSync(
    entry,
    `export { stripFences, parseVerifyResponse, buildVerifyPrompt, buildRepairPrompt, runVerifyChain } from ${JSON.stringify(path.join(repoRoot, "src/core/verify"))};\n` +
      `export { TransformRunner } from ${JSON.stringify(path.join(repoRoot, "src/core/transform"))};\n` +
      `export { DEFAULT_SETTINGS } from ${JSON.stringify(path.join(repoRoot, "src/settings/settings"))};\n`
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

const mod = loadModule();
const {
  stripFences,
  parseVerifyResponse,
  buildVerifyPrompt,
  buildRepairPrompt,
  runVerifyChain,
  TransformRunner,
  DEFAULT_SETTINGS,
} = mod;

// --- fixtures --------------------------------------------------------------

const TEMPLATE = {
  name: "test",
  description: "",
  instruction: "Rewrite.",
  filePath: "t.md",
};

function ctx(overrides = {}) {
  return {
    defaultContext: "",
    perNoteContext: null,
    rawBody: "- decision: ship on Tuesday\n- Park prefers option B",
    transcript: null,
    gitLog: null,
    template: TEMPLATE,
    vaultRoot: "/",
    ...overrides,
  };
}

function res(text, usage = {}) {
  return { text, ...usage };
}

/** generate stub that replays scripted responses and records calls. */
function scriptedGenerate(script) {
  const calls = [];
  const fn = async (input) => {
    calls.push(input);
    const step = script[calls.length - 1];
    if (step instanceof Error) throw step;
    return { ...step };
  };
  fn.calls = calls;
  return fn;
}

// --- parseVerifyResponse / stripFences -------------------------------------

console.log("parseVerifyResponse — response contract");
check("valid JSON with missing[] parses", () => {
  assert.deepEqual(parseVerifyResponse('{"missing": ["a", "b"]}'), ["a", "b"]);
});
check("empty missing[] parses to []", () => {
  assert.deepEqual(parseVerifyResponse('{"missing": []}'), []);
});
check("fenced JSON parses (fence stripped)", () => {
  assert.deepEqual(parseVerifyResponse('```json\n{"missing": ["a"]}\n```'), ["a"]);
});
check("non-JSON → null", () => {
  assert.equal(parseVerifyResponse("Everything looks complete."), null);
});
check("missing key absent → null", () => {
  assert.equal(parseVerifyResponse('{"ok": true}'), null);
});
check("missing not an array → null", () => {
  assert.equal(parseVerifyResponse('{"missing": "a"}'), null);
});
check("missing with non-string entries → null", () => {
  assert.equal(parseVerifyResponse('{"missing": [1, 2]}'), null);
});
check("stripFences: unfenced text passes through trimmed", () => {
  assert.equal(stripFences("  hello\n"), "hello");
});
check("stripFences: fenced block loses only the fence lines", () => {
  assert.equal(stripFences("```markdown\n# a\nb\n```"), "# a\nb");
});

// --- prompt assembly -------------------------------------------------------

console.log("buildVerifyPrompt — assembly and judgment-set pins");
check("carries raw memo, transformed note, and the JSON reply instruction", () => {
  const p = buildVerifyPrompt(ctx(), "OUT");
  assert.match(p.user, /=== RAW MEMO ===/);
  assert.match(p.user, /ship on Tuesday/);
  assert.match(p.user, /=== TRANSFORMED NOTE ===/);
  assert.match(p.user, /\bOUT\b/);
  assert.match(p.user, /\{"missing"/);
});
check("missing[] entries are required to be self-contained source quotes", () => {
  const p = buildVerifyPrompt(ctx(), "OUT");
  assert.match(p.user, /self-contained/i);
});
check("perNoteContext included only when present", () => {
  const without = buildVerifyPrompt(ctx(), "OUT");
  const withCtx = buildVerifyPrompt(ctx({ perNoteContext: "1:1 with Park" }), "OUT");
  assert.doesNotMatch(without.user, /NOTE-SPECIFIC CONTEXT/);
  assert.match(withCtx.user, /NOTE-SPECIFIC CONTEXT/);
  assert.match(withCtx.user, /1:1 with Park/);
});
check("transcript absent → no transcript section, no transcript rules", () => {
  const p = buildVerifyPrompt(ctx(), "OUT");
  assert.doesNotMatch(p.user, /TRANSCRIPT/);
  assert.doesNotMatch(p.user, /speaker/i);
});
check("transcript present → transcript section + category-limited judgment set", () => {
  const p = buildVerifyPrompt(ctx({ transcript: "raw stt text" }), "OUT");
  assert.match(p.user, /MEETING TRANSCRIPT/);
  assert.match(p.user, /raw stt text/);
  // 수치·이름·날짜·결정 한정 (contract 누락 판정 대상)
  assert.match(p.user, /figures, names, dates, and decisions/i);
  // 화자-라벨 비신뢰 (R2 WARN)
  assert.match(p.user, /speaker/i);
  // 잡담 제외 상속
  assert.match(p.user, /small talk/i);
});

console.log("buildRepairPrompt — repair input contract");
check("repair input carries the raw memo (fabrication guard), note, and missing list", () => {
  const p = buildRepairPrompt(ctx(), "OUT", ["fact one", "fact two"]);
  assert.match(p.user, /=== RAW MEMO ===/);
  assert.match(p.user, /ship on Tuesday/);
  assert.match(p.user, /\bOUT\b/);
  assert.match(p.user, /fact one/);
  assert.match(p.user, /fact two/);
  assert.match(p.user, /Do not invent/i);
});

// --- runVerifyChain branching ----------------------------------------------

console.log("runVerifyChain — branching");
await checkAsync("missing [] → verified, one call, text untouched", async () => {
  const gen = scriptedGenerate([res('{"missing": []}')]);
  const response = res("BODY", { inputTokens: 10, outputTokens: 20, costUsd: 0.1 });
  const v = await runVerifyChain(gen, ctx(), response);
  assert.equal(v.status, "verified");
  assert.equal(gen.calls.length, 1);
  assert.equal(response.text, "BODY");
});
await checkAsync("missing [] → verify usage aggregated into the response", async () => {
  const gen = scriptedGenerate([res('{"missing": []}', { inputTokens: 5, outputTokens: 7, costUsd: 0.02 })]);
  const response = res("BODY", { inputTokens: 10, outputTokens: 20, costUsd: 0.1 });
  await runVerifyChain(gen, ctx(), response);
  assert.equal(response.inputTokens, 15);
  assert.equal(response.outputTokens, 27);
  assert.ok(Math.abs(response.costUsd - 0.12) < 1e-9);
});
await checkAsync("missing [a,b] → repair once, stripped output replaces text, repairedCount 2", async () => {
  const gen = scriptedGenerate([
    res('{"missing": ["a", "b"]}'),
    res("```markdown\nREPAIRED\n```"),
  ]);
  const response = res("BODY");
  const v = await runVerifyChain(gen, ctx(), response);
  assert.equal(v.status, "repaired");
  assert.equal(v.repairedCount, 2);
  assert.equal(gen.calls.length, 2);
  assert.equal(response.text, "REPAIRED");
});
await checkAsync("verify call throws → verify-failed, no repair, text kept", async () => {
  const gen = scriptedGenerate([new Error("boom")]);
  const response = res("BODY");
  const v = await runVerifyChain(gen, ctx(), response);
  assert.equal(v.status, "verify-failed");
  assert.equal(gen.calls.length, 1);
  assert.equal(response.text, "BODY");
});
await checkAsync("verify returns garbage → verify-failed, no repair", async () => {
  const gen = scriptedGenerate([res("all good!")]);
  const response = res("BODY");
  const v = await runVerifyChain(gen, ctx(), response);
  assert.equal(v.status, "verify-failed");
  assert.equal(gen.calls.length, 1);
  assert.equal(response.text, "BODY");
});
await checkAsync("repair call throws → verify-failed, original text kept", async () => {
  const gen = scriptedGenerate([res('{"missing": ["a"]}'), new Error("boom")]);
  const response = res("BODY");
  const v = await runVerifyChain(gen, ctx(), response);
  assert.equal(v.status, "verify-failed");
  assert.equal(response.text, "BODY");
});
await checkAsync("repair degenerate output (empty after fence strip) → verify-failed, original kept", async () => {
  const gen = scriptedGenerate([res('{"missing": ["a"]}'), res("```\n\n```")]);
  const response = res("BODY");
  const v = await runVerifyChain(gen, ctx(), response);
  assert.equal(v.status, "verify-failed");
  assert.equal(response.text, "BODY");
});
await checkAsync("chain never exceeds 3 total LLM calls (transform + verify + repair)", async () => {
  const gen = scriptedGenerate([res('{"missing": ["a"]}'), res("FIXED")]);
  await runVerifyChain(gen, ctx(), res("BODY"));
  assert.ok(gen.calls.length <= 2, "verify+repair must be at most 2 calls on top of the transform");
});

// --- TransformRunner integration -------------------------------------------

console.log("TransformRunner.run — chain wiring");

function makeEditor(noteText) {
  return { getSelection: () => "", getValue: () => noteText };
}
function makePlugin(settings, generateScript) {
  const gen = scriptedGenerate(generateScript);
  return {
    plugin: {
      settings,
      app: { workspace: { getActiveFile: () => null }, metadataCache: {}, vault: {} },
      vaultRoot: () => "/",
      resolveProvider: async () => ({ id: "stub", generate: gen, ping: async () => ({ ok: true }) }),
      setStatusBusy: () => {},
    },
    gen,
  };
}

await checkAsync("toggle ON + plain memo + missing [] → verification.status verified", async () => {
  const { plugin, gen } = makePlugin(
    { ...DEFAULT_SETTINGS, verifyCompleteness: true },
    [res("OUT"), res('{"missing": []}')]
  );
  const runner = new TransformRunner(plugin);
  const { response, verification } = await runner.run(makeEditor("memo body"), TEMPLATE);
  assert.equal(verification?.status, "verified");
  assert.equal(gen.calls.length, 2);
  assert.equal(response.text, "OUT");
});
await checkAsync("toggle OFF → verification null, exactly one call", async () => {
  const { plugin, gen } = makePlugin(
    { ...DEFAULT_SETTINGS, verifyCompleteness: false },
    [res("OUT")]
  );
  const runner = new TransformRunner(plugin);
  const { verification } = await runner.run(makeEditor("memo body"), TEMPLATE);
  assert.equal(verification, null);
  assert.equal(gen.calls.length, 1);
});
check("DEFAULT_SETTINGS ships verifyCompleteness: true", () => {
  assert.equal(DEFAULT_SETTINGS.verifyCompleteness, true);
});

await checkAsync("toggle ON + [!git] note → skipped-git, chain not entered (one call)", async () => {
  // Real repo fixture, same pattern as probe-transform-preservation.mjs —
  // loadGitLog must return non-null for transform.ts to take the skip branch.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "probe-verify-git-"));
  const git = (...args) =>
    execFileSync("git", ["-C", repo, ...args], {
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: "2024-01-02T03:04:05Z",
        GIT_COMMITTER_DATE: "2024-01-02T03:04:05Z",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
      },
    });
  git("init", "-q", "-b", "main");
  git("-c", "user.email=p@p", "-c", "user.name=p", "commit", "-q", "--allow-empty", "-m", "seed");

  const { plugin, gen } = makePlugin(
    { ...DEFAULT_SETTINGS, verifyCompleteness: true },
    [res("OUT")]
  );
  const runner = new TransformRunner(plugin);
  const note = `> [!git] ${repo} since:2024-01-01 until:2024-01-03\n\nmemo body`;
  const { verification } = await runner.run(makeEditor(note), TEMPLATE);
  assert.equal(verification?.status, "skipped-git");
  assert.equal(gen.calls.length, 1);
});

// --- summary ---------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall passed");
