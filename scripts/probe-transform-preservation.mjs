/**
 * Characterization safety net for docs/specs/completeness-verify-chain.md's
 * Preservation contract — run with `node scripts/probe-transform-preservation.mjs`.
 *
 * Written and run BEFORE the verify→repair chain is inserted into
 * TransformRunner.run(): every check below pins behavior observed on the
 * pre-change code, so a chain insertion that disturbs the preserved surfaces
 * turns this probe red. It deliberately covers NO new chain behavior — that
 * is scripts/probe-verify-chain.mjs's job (the contract's 검증 수단), written
 * red-first at implementation time.
 *
 * Same convention as scripts/probe-git-log.mjs / probe-settings-tab.mjs: no
 * test runner exists, transform.ts imports `obsidian` at module top, so this
 * script esbuild-bundles it with an `obsidian` stub and asserts with
 * node:assert. Fixtures are probe-local duck types (a 2-method editor, a
 * 5-member plugin fake) — no new shared mock infrastructure.
 *
 * Forward-compatibility with the planned change (this file must stay green,
 * unchanged, after the chain lands):
 *   - plugin fixtures set `verifyCompleteness` explicitly. Pre-change the
 *     field is unread; post-change `false` pins the toggle-OFF preserved
 *     path and `true` on the [!git] fixture pins the gitLog-skip path
 *     (chain must not run: still exactly one generate call).
 *   - run()'s return is asserted field-wise (response, transformContext),
 *     never as a whole-object key set — the contract may add a verify-status
 *     field alongside; TransformContext itself is unchanged, so that one IS
 *     pinned with deepEqual.
 *   - DEFAULT_SETTINGS is pinned per existing key, not by key-set equality —
 *     the contract adds `verifyCompleteness: true` as a new key.
 *
 * Out of scope, judged not testable in this idiom (reported to the caller,
 * not papered over with hollow tests):
 *   - PreviewModal (cost/meta line, buttons, action flow — the badge's
 *     future render site) and main.ts's transformAndPreview orchestration:
 *     Obsidian Modal + DOM-augmentation bound (createEl/createDiv,
 *     MarkdownRenderer, Component, setTooltip); no seam without a new
 *     recording-DOM stub — a fixture-class construction needing approval.
 *   - The LlmProvider interface: runtime-erased; `tsc` guards it.
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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "probe-transform-preservation-"));

// git-log.ts calls window.setTimeout/clearTimeout — real in Obsidian's
// renderer, absent under plain Node (same polyfill as probe-git-log.mjs).
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

// --- obsidian stub ---------------------------------------------------------

const STUB_SOURCE = `
export const noticeLog = [];
export class Notice {
  constructor(message) {
    this.message = message;
    noticeLog.push(message);
  }
}
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
    `export { TransformRunner } from ${JSON.stringify(path.join(repoRoot, "src/core/transform"))};\n` +
      `export { buildPrompt } from ${JSON.stringify(path.join(repoRoot, "src/core/prompt"))};\n` +
      `export { DEFAULT_SETTINGS } from ${JSON.stringify(path.join(repoRoot, "src/settings/settings"))};\n` +
      `export { t } from ${JSON.stringify(path.join(repoRoot, "src/i18n"))};\n` +
      `export { noticeLog } from "obsidian";\n`
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
const { TransformRunner, buildPrompt, DEFAULT_SETTINGS, t, noticeLog } = mod;

// --- fixtures --------------------------------------------------------------

const TEMPLATE = {
  name: "work-log",
  description: "",
  instruction: "Write the work log.",
  filePath: "t.md",
  model: "model-x",
};
const TEMPLATE_NO_MODEL = { ...TEMPLATE };
delete TEMPLATE_NO_MODEL.model;

const RESPONSE = {
  text: "TRANSFORMED",
  inputTokens: 11,
  outputTokens: 7,
  costUsd: 0.0123,
  modelUsed: "m-used",
};

function makeProvider({ response = RESPONSE, throws = null } = {}) {
  const calls = [];
  return {
    id: "fake",
    calls,
    async generate(input, opts) {
      calls.push({ input, opts });
      if (throws) throw throws;
      return response;
    },
    async ping() {
      return { ok: true };
    },
  };
}

function makePlugin({ provider, settings = {}, app = undefined } = {}) {
  const busyLog = [];
  const resolveCalls = [];
  const plugin = {
    // verifyCompleteness explicit on purpose — see the file header.
    settings: { defaultContext: "", verifyCompleteness: false, ...settings },
    app,
    vaultRoot: () => "/vault",
    async resolveProvider(template) {
      resolveCalls.push(template);
      return provider;
    },
    setStatusBusy(b) {
      busyLog.push(b);
    },
  };
  plugin.__probe = { busyLog, resolveCalls };
  return plugin;
}

const fakeEditor = (value, selection = "") => ({
  getSelection: () => selection,
  getValue: () => value,
});

/** files: { [linkpath]: { basename, content } } — only what loadTranscript touches. */
function makeApp(files) {
  return {
    workspace: { getActiveFile: () => ({ path: "note.md" }) },
    metadataCache: { getFirstLinkpathDest: (link) => files[link] ?? null },
    vault: { read: async (file) => file.content },
  };
}

async function runOnce({
  memo,
  selection = "",
  template = TEMPLATE,
  settings = {},
  app = undefined,
  providerOpts = {},
} = {}) {
  const provider = makeProvider(providerOpts);
  const plugin = makePlugin({ provider, settings, app });
  const runner = new TransformRunner(plugin);
  const result = await runner.run(fakeEditor(memo, selection), template);
  return { result, provider, plugin };
}

// --- run(): plain memo — the toggle-OFF preserved path ---------------------

console.log("run() — plain memo (toggle-OFF path)");

const MEMO = "meeting notes line one\nline two";

{
  const { result, provider, plugin } = await (async () =>
    runOnce({ memo: MEMO, settings: { defaultContext: "always-on ctx" } }))();

  check("exactly one provider.generate call; response passed through by reference", () => {
    assert.equal(provider.calls.length, 1);
    assert.equal(result.response, RESPONSE);
  });

  check("transformContext carries exactly the pre-change fields and values", () => {
    assert.deepEqual(result.transformContext, {
      defaultContext: "always-on ctx",
      perNoteContext: null,
      rawBody: MEMO,
      transcript: null,
      gitLog: null,
      template: TEMPLATE,
      vaultRoot: "/vault",
    });
  });

  check("generate receives buildPrompt(transformContext) verbatim", () => {
    assert.deepEqual(provider.calls[0].input, buildPrompt(result.transformContext));
  });

  check("template.model is forwarded as generate opts { model }", () => {
    assert.deepEqual(provider.calls[0].opts, { model: "model-x" });
  });

  check("status bar brackets the call: busy true then false", () => {
    assert.deepEqual(plugin.__probe.busyLog, [true, false]);
  });

  check("resolveProvider called exactly once, with the template", () => {
    assert.equal(plugin.__probe.resolveCalls.length, 1);
    assert.equal(plugin.__probe.resolveCalls[0], TEMPLATE);
  });
}

await checkAsync("a template without a model forwards opts === undefined", async () => {
  const { provider } = await runOnce({ memo: MEMO, template: TEMPLATE_NO_MODEL });
  assert.equal(provider.calls[0].opts, undefined);
});

await checkAsync("an editor selection becomes the raw memo (selection wins)", async () => {
  const { result } = await runOnce({ memo: "full note body", selection: "selected part" });
  assert.equal(result.transformContext.rawBody, "selected part");
});

await checkAsync("a whitespace-only selection falls back to the full note", async () => {
  const { result } = await runOnce({ memo: "full note body", selection: "   " });
  assert.equal(result.transformContext.rawBody, "full note body");
});

await checkAsync("empty note throws transform.note-empty before any provider or status-bar work", async () => {
  const provider = makeProvider();
  const plugin = makePlugin({ provider });
  const runner = new TransformRunner(plugin);
  await assert.rejects(runner.run(fakeEditor("   \n  "), TEMPLATE), {
    message: t("transform.note-empty"),
  });
  assert.equal(provider.calls.length, 0);
  assert.deepEqual(plugin.__probe.busyLog, []);
});

await checkAsync(
  "a transform failure propagates as-is, surfaces the generic Notice, and clears busy",
  async () => {
    const boom = new Error("provider down");
    const provider = makeProvider({ throws: boom });
    const plugin = makePlugin({ provider });
    const runner = new TransformRunner(plugin);
    await assert.rejects(runner.run(fakeEditor(MEMO), TEMPLATE), (e) => e === boom);
    assert.equal(noticeLog.at(-1), t("notice.error-generic", { detail: "provider down" }));
    assert.deepEqual(plugin.__probe.busyLog, [true, false]);
  }
);

// --- run(): callout guards and transcript loading --------------------------

console.log("run() — callout guards and [!stt] transcripts");

await checkAsync("[!stt] callout without a [[link]] throws stt-no-link", async () => {
  const provider = makeProvider();
  const runner = new TransformRunner(makePlugin({ provider }));
  await assert.rejects(runner.run(fakeEditor("> [!stt]\n\nbody text"), TEMPLATE), {
    message: t("transform.stt-no-link"),
  });
  assert.equal(provider.calls.length, 0);
});

await checkAsync("[!git] callout without a path throws git.no-path", async () => {
  const provider = makeProvider();
  const runner = new TransformRunner(makePlugin({ provider }));
  await assert.rejects(runner.run(fakeEditor("> [!git]\n\nbody text"), TEMPLATE), {
    message: t("git.no-path"),
  });
  assert.equal(provider.calls.length, 0);
});

await checkAsync("an unresolvable [!stt] link throws stt-not-found, status bar untouched", async () => {
  const provider = makeProvider();
  const plugin = makePlugin({ provider, app: makeApp({}) });
  const runner = new TransformRunner(plugin);
  await assert.rejects(runner.run(fakeEditor("> [!stt] [[missing]]\n\nbody"), TEMPLATE), {
    message: t("transform.stt-not-found", { name: "missing" }),
  });
  assert.deepEqual(plugin.__probe.busyLog, []);
});

await checkAsync("a single [!stt] link loads the file trimmed as the transcript", async () => {
  const app = makeApp({ rec: { basename: "rec", content: "  transcript words  " } });
  const { result, provider } = await runOnce({
    memo: "> [!stt] [[rec]]\n\nbody",
    app,
  });
  assert.equal(result.transformContext.transcript, "transcript words");
  assert.ok(provider.calls[0].input.user.includes("=== MEETING TRANSCRIPT (STT) ==="));
});

await checkAsync("two [!stt] links join with per-file '--- basename ---' headers", async () => {
  const app = makeApp({
    rec1: { basename: "rec1", content: "AAA" },
    rec2: { basename: "rec2", content: "BBB" },
  });
  const { result } = await runOnce({
    memo: "> [!stt]\n> [[rec1]]\n> [[rec2]]\n\nbody",
    app,
  });
  assert.equal(result.transformContext.transcript, "--- rec1 ---\nAAA\n\n--- rec2 ---\nBBB");
});

await checkAsync("[!context] callout becomes perNoteContext and its prompt section", async () => {
  const { result, provider } = await runOnce({
    memo: "> [!context]\n> Date: 2026-07-20\n\nbody line",
  });
  assert.equal(result.transformContext.perNoteContext, "Date: 2026-07-20");
  assert.equal(result.transformContext.rawBody, "body line");
  assert.ok(provider.calls[0].input.user.includes("=== NOTE-SPECIFIC CONTEXT ==="));
});

// --- run(): [!git] memo — the gitLog-skip preserved path -------------------
// verifyCompleteness deliberately TRUE here: pre-change it is unread; after
// the chain lands this fixture pins the gitLog-skip clause — the chain must
// not run (still exactly one generate call, response passed through).

console.log("run() — [!git] memo (gitLog-skip path)");

function buildRepoFixture() {
  const repo = path.join(tmp, "repo");
  fs.mkdirSync(repo);
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  const git = (args, env = {}) =>
    execFileSync(
      "git",
      ["-C", repo, "-c", "user.name=probe", "-c", "user.email=probe@example.com", "-c", "commit.gpgsign=false", ...args],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } }
    );
  fs.writeFileSync(path.join(repo, "README"), "base\n");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "probe base commit"], {
    GIT_AUTHOR_DATE: "2024-03-03T12:00:00Z",
    GIT_COMMITTER_DATE: "2024-03-03T12:00:00Z",
  });
  return repo;
}

{
  const repo = buildRepoFixture();
  const gitMemo = `> [!git] ${repo} since:2024-01-01 until:2024-12-31\n\ndid some work`;
  const { result, provider } = await runOnce({
    memo: gitMemo,
    settings: { verifyCompleteness: true },
  });

  check("[!git] memo produces a non-null gitLog carrying the repo's commit", () => {
    assert.equal(typeof result.transformContext.gitLog, "string");
    assert.ok(result.transformContext.gitLog.includes("repository: "), "missing repository header");
    assert.ok(result.transformContext.gitLog.includes("probe base commit"), "missing the fixture commit");
  });

  check("gitLog path: still exactly one generate call, response passed through", () => {
    assert.equal(provider.calls.length, 1);
    assert.equal(result.response, RESPONSE);
  });

  check("gitLog path: prompt carries exactly one GIT LOG block, built verbatim", () => {
    const user = provider.calls[0].input.user;
    assert.equal(user.split("=== GIT LOG ===").length - 1, 1);
    assert.deepEqual(provider.calls[0].input, buildPrompt(result.transformContext));
  });

  check("gitLog path: rawBody excludes the [!git] callout", () => {
    assert.equal(result.transformContext.rawBody, "did some work");
  });
}

// --- buildPrompt assembly pinned -------------------------------------------
// prompt.ts is OUTSIDE the contract's allowed-surface (must stay untouched);
// these exact-string pins turn any accidental edit — or any change to what
// run() feeds it — into a loud failure. Rule literals below are observed
// output, transcribed from the pre-change code.

console.log("buildPrompt — assembly and OUTPUT RULES pinned");

const BASE_RULES = [
  "Reply with the transformed note in Markdown only.",
  "Do not wrap your reply in code fences.",
  "Write the entire output, including section headings, in the language of the raw memo.",
  "Completeness: every distinct fact, statement, name, number, date, and decision in the raw memo must appear in the output. Restructure and deduplicate freely, but never drop content. When unsure whether something matters, include it.",
  "Output length scales with input length. Do not compress for brevity unless the TASK explicitly asks for summarization.",
  "Do not reproduce the raw memo verbatim as one block; reorganize it into the requested structure.",
  "Do not invent facts. Inference belongs only in sections the TASK explicitly labels as interpretation.",
];

const STT_RULES = [
  "The RAW MEMO is the author's authoritative record. The MEETING TRANSCRIPT is automatic speech-to-text of the same meeting: it may contain recognition errors, wrong speaker attribution, and filler talk.",
  "Use the transcript to recover details, figures, names, and decisions the memo omits. When the memo and the transcript conflict, the memo wins.",
  "Ignore transcript passages that are small talk or clearly off-topic.",
  "If a transcript passage is too garbled to interpret reliably, do not guess: mark the affected item with a note meaning 'STT damaged segment' in the output language (in Korean: '(STT 손상 구간)').",
];

const GIT_RULES = [
  "The GIT LOG is the factual record of code changes in the named repositories. Treat commit messages and diffstats as ground truth for what was done; do not invent work that is not in the log or the memo.",
  "The GIT LOG groups commits into sections, and every section in it is work that reached the repository's default branch — it shipped. A '--- landed <date>' section carries that landing's commits, and the date on that header is when it shipped. A '--- confirmed landed on <base> branch: <name>' section names a branch proven to have reached the base; it lists that branch's commit subjects when it carries any, and when it carries no lines at all its commits either appear among the '--- landed' sections instead or are not in this log at all — narrowing the window never removes the branch's name, only whether its commits are shown alongside it. A '(landed <date>)' suffix on that header names the one landing that confirmed the branch; its absence means only ancestry proved it, with no single landing to date.",
  "Work that has not reached the default branch is not in the GIT LOG at all. Never report anything from it as in progress, pending, or not yet shipped.",
  "Group and describe the work by intent (feature, fix, refactor), not commit-by-commit; merge related commits into one line of substance.",
  "When the TASK selects work from the GIT LOG using items in the raw memo (such as an issue list), those memo items are selection criteria, not content to preserve: an item with no matching work in the log produces no entry, and must never be given an invented date or description. For such items this overrides the completeness rule above.",
  "Match memo items to commits by what the commits actually say. Do not reinterpret or reframe a commit to force a match; when a commit matches no item as written, leave it out.",
];

const ctxWith = (overrides = {}) => ({
  defaultContext: "",
  perNoteContext: null,
  rawBody: "memo body",
  transcript: null,
  gitLog: null,
  template: TEMPLATE,
  vaultRoot: "/vault",
  ...overrides,
});

check("plain context: empty system, exact user assembly (labels, order, base rules)", () => {
  const out = buildPrompt(ctxWith());
  assert.equal(out.system, "");
  assert.equal(
    out.user,
    [
      "=== RAW MEMO ===",
      "memo body",
      "=== TASK ===",
      TEMPLATE.instruction,
      "=== OUTPUT RULES ===",
      BASE_RULES.join("\n"),
    ].join("\n\n")
  );
});

check("defaultContext lands in system as the always-on block", () => {
  const out = buildPrompt(ctxWith({ defaultContext: "  always-on ctx  " }));
  assert.equal(out.system, "=== USER CONTEXT (always-on) ===\nalways-on ctx");
});

check("full context: exact section order and the full BASE+STT+GIT rules block", () => {
  const out = buildPrompt(
    ctxWith({
      perNoteContext: "note ctx",
      transcript: "transcript text",
      gitLog: "--- landed 2024-07-14 direct\nwork",
    })
  );
  assert.equal(
    out.user,
    [
      "=== NOTE-SPECIFIC CONTEXT ===",
      "note ctx",
      "=== RAW MEMO ===",
      "memo body",
      "=== MEETING TRANSCRIPT (STT) ===",
      "transcript text",
      "=== GIT LOG ===",
      "--- landed 2024-07-14 direct\nwork",
      "=== TASK ===",
      TEMPLATE.instruction,
      "=== OUTPUT RULES ===",
      [...BASE_RULES, ...STT_RULES, ...GIT_RULES].join("\n"),
    ].join("\n\n")
  );
});

check("the completeness contract line is shipped verbatim (the chain's anchor — §Why)", () => {
  const out = buildPrompt(ctxWith());
  assert.ok(
    out.user.includes(
      "Completeness: every distinct fact, statement, name, number, date, and decision in the raw memo must appear in the output."
    ),
    "the completeness OUTPUT RULE is missing or reworded"
  );
});

// --- DEFAULT_SETTINGS: existing keys pinned --------------------------------
// Per-key pins, deliberately NOT key-set equality — the contract adds
// `verifyCompleteness: true` as a new key; every pre-existing default must
// survive the settings edit unchanged.

console.log("DEFAULT_SETTINGS — existing defaults pinned");

check("existing top-level defaults unchanged", () => {
  assert.equal(DEFAULT_SETTINGS.language, "auto");
  assert.equal(DEFAULT_SETTINGS.authMethod, "claude-code-cli");
  assert.equal(DEFAULT_SETTINGS.defaultContext, "");
  assert.equal(DEFAULT_SETTINGS.defaultTemplate, "meeting");
  assert.equal(DEFAULT_SETTINGS.templatesFolder, "excaVelo/templates");
  assert.equal(DEFAULT_SETTINGS.showStatusBar, true);
  assert.equal(DEFAULT_SETTINGS.showCostInPreview, true);
  assert.equal(DEFAULT_SETTINGS.hasCompletedOnboarding, false);
});

check("existing nested provider defaults unchanged", () => {
  assert.deepEqual(DEFAULT_SETTINGS.claudeCodeCli, {
    binaryPath: "",
    model: "sonnet",
    permissionMode: "bypassPermissions",
    workingDirectory: "vault-root",
    customWorkingDirectory: "",
    timeoutSeconds: 720,
  });
  assert.deepEqual(DEFAULT_SETTINGS.anthropicApi, {
    apiKey: "",
    model: "claude-sonnet-4-6",
  });
  assert.deepEqual(DEFAULT_SETTINGS.openAiCompat, {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
  });
});

// ---------------------------------------------------------------------------

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
