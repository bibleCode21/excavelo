/**
 * Characterization probe for src/settings/settings-tab.ts — run with
 * `node scripts/probe-settings-tab.mjs`.
 *
 * No test runner exists (package.json declares lint and build only), and
 * settings-tab.ts imports `obsidian` at module top, so it cannot be required
 * from plain node. This script esbuild-bundles the module with a hand-rolled
 * `obsidian` stub and asserts against the bundle with node:assert — same
 * convention as scripts/probe-git-log.mjs. No framework, no new dependency.
 *
 * Per docs/specs/settings-tab-declarative-definitions.md's "Characterization
 * safety net" section: this file is written and run against PRE-migration
 * code first (ExcaveloSettingTab.display()) and committed as the safety-net
 * snapshot, then re-run UNCHANGED against POST-migration code
 * (ExcaveloSettingTab.getSettingDefinitions()). The `renderTab()` helper below
 * dispatches to whichever one exists, mirroring Obsidian's own documented
 * rule: getSettingDefinitions() wins when it returns a non-empty array,
 * display() is the fallback. That dispatch is what lets the exact same
 * assertions run against both states of the code.
 *
 * The stub's `Setting` is a *recording* fake, not a DOM: every
 * .setName/.setDesc/.setHeading/.addXxx call is recorded onto a `controls`
 * array (a row can carry more than one control — the shared model picker row
 * adds a dropdown-or-text control *and* a Load/Reload button on the same
 * Setting), and every onChange/onClick handler is captured so the probe can
 * invoke it directly and inspect its effect on a fake plugin.settings object.
 * It cannot observe Obsidian's real renderer or its settings-search index —
 * that residual is covered by the contract's manual-QA acceptance criterion,
 * not here.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import esbuild from "esbuild";

const repoRoot = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "probe-settings-tab-"));

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

// --- obsidian stub -----------------------------------------------------

const STUB_SOURCE = `
export class App {}

export const noticeLog = [];
export class Notice {
  constructor(message) {
    this.message = message;
    noticeLog.push(message);
  }
}

let requestUrlHandler = async () => {
  throw new Error("probe: requestUrlHandler not set");
};
export function __setRequestUrlHandler(fn) {
  requestUrlHandler = fn;
}
export async function requestUrl(opts) {
  return requestUrlHandler(opts);
}

class FakeContainerEl {
  constructor() {
    this.classes = new Set();
  }
  empty() {}
  addClass(...cs) {
    for (const c of cs) this.classes.add(c);
  }
}

export class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = new FakeContainerEl();
  }
  update() {}
  hide() {}
}

export let createdSettings = [];
export function __resetCreatedSettings() {
  createdSettings = [];
}

function makeComponent(kind) {
  const c = { kind, options: [], disabled: false, cta: false, destructive: false, inputEl: {} };
  c.setValue = (v) => { c.value = v; return c; };
  c.setPlaceholder = (v) => { c.placeholder = v; return c; };
  c.onChange = (fn) => { c.onChangeFn = fn; return c; };
  c.onClick = (fn) => { c.onClickFn = fn; return c; };
  c.addOption = (value, label) => { c.options.push({ value, label }); return c; };
  c.setButtonText = (v) => { c.buttonText = v; return c; };
  c.setCta = () => { c.cta = true; return c; };
  c.setDisabled = (v) => { c.disabled = v; return c; };
  c.setDestructive = () => { c.destructive = true; return c; };
  return c;
}

export class Setting {
  constructor(containerEl) {
    this.containerEl = containerEl;
    this.name = undefined;
    this.desc = undefined;
    this.isHeading = false;
    this.controls = [];
    createdSettings.push(this);
  }
  setName(v) { this.name = v; return this; }
  setDesc(v) { this.desc = v; return this; }
  setHeading() { this.isHeading = true; return this; }
  addText(cb) { const c = makeComponent("text"); cb(c); this.controls.push(c); return this; }
  addTextArea(cb) { const c = makeComponent("textarea"); cb(c); this.controls.push(c); return this; }
  addDropdown(cb) { const c = makeComponent("dropdown"); cb(c); this.controls.push(c); return this; }
  addToggle(cb) { const c = makeComponent("toggle"); cb(c); this.controls.push(c); return this; }
  addButton(cb) { const c = makeComponent("button"); cb(c); this.controls.push(c); return this; }
}
`;

function loadModule() {
  const stub = path.join(tmp, "obsidian-stub.js");
  const entry = path.join(tmp, "entry.ts");
  const out = path.join(tmp, "bundle.cjs");
  fs.writeFileSync(stub, STUB_SOURCE);
  fs.writeFileSync(
    entry,
    `export { ExcaveloSettingTab } from ${JSON.stringify(
      path.join(repoRoot, "src/settings/settings-tab")
    )};\n` +
      `export { Setting, noticeLog, __setRequestUrlHandler, createdSettings, __resetCreatedSettings } from "obsidian";\n` +
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

const mod = loadModule();
const { ExcaveloSettingTab, noticeLog, t } = mod;

// A row's control list is comparable whether it comes from a live stub
// Setting (rawRow results) or a plain snapshot() row — both carry `controls`.
function ctrl(row, kind) {
  return row.controls?.find((c) => c.kind === kind);
}

// --- fixtures ------------------------------------------------------------

function defaultSettings(overrides = {}) {
  return {
    language: "auto",
    authMethod: "claude-code-cli",
    claudeCodeCli: {
      binaryPath: "",
      model: "",
      permissionMode: "default",
      workingDirectory: "vault-root",
      customWorkingDirectory: "",
      timeoutSeconds: 720,
    },
    anthropicApi: { apiKey: "", model: "" },
    openAiCompat: { baseUrl: "", apiKey: "", model: "" },
    defaultContext: "",
    defaultTemplate: "",
    templatesFolder: "",
    showStatusBar: true,
    showCostInPreview: true,
    hasCompletedOnboarding: true,
    ...overrides,
  };
}

function makeFakePlugin(settingsOverrides = {}) {
  const saveSettingsCalls = [];
  const templatesCalls = [];
  const openTemplatesFolderCalls = [];
  const pingState = { result: { ok: true, detail: "ok" }, throws: null };
  const plugin = {
    settings: defaultSettings(settingsOverrides),
    async saveSettings() {
      saveSettingsCalls.push(1);
    },
    providerFor(_method) {
      return {
        async ping() {
          if (pingState.throws) throw pingState.throws;
          return pingState.result;
        },
      };
    },
    async openTemplatesFolder() {
      openTemplatesFolderCalls.push(1);
    },
    templates: {
      async ensureStarter() {
        templatesCalls.push("restore");
      },
      async forceWriteStarter() {
        templatesCalls.push("update");
      },
    },
  };
  plugin.__probe = { saveSettingsCalls, templatesCalls, openTemplatesFolderCalls, pingState };
  return plugin;
}

// --- declarative-tree walker (simulates enough of Obsidian's renderer to
// drive the recording Setting fake the same way for both pre- and
// post-migration code) ---------------------------------------------------

function evalVisible(v) {
  return typeof v === "function" ? !!v() : v !== false;
}

function instantiateRow(containerEl, item) {
  const s = new mod.Setting(containerEl);
  if (item.name !== undefined) s.setName(item.name);
  if (item.desc !== undefined) s.setDesc(item.desc);
  const fakeGroup = { addSetting: () => fakeGroup, setHeading: () => fakeGroup };
  if (typeof item.render === "function") item.render(s, fakeGroup);
  return s;
}

function walkDefinitions(containerEl, items) {
  for (const item of items ?? []) {
    if (item.type === "group" || item.type === "list") {
      if (!evalVisible(item.visible)) continue;
      if (item.heading) new mod.Setting(containerEl).setName(item.heading).setHeading();
      walkDefinitions(containerEl, item.items);
    } else if (item.type === "page") {
      // Not used by this migration (§Non-goals) — nothing to walk.
    } else {
      if (!evalVisible(item.visible)) continue;
      instantiateRow(containerEl, item);
    }
  }
}

/**
 * Renders the tab exactly once, dispatching the same way Obsidian itself
 * does: getSettingDefinitions() wins when non-empty, display() is the
 * fallback (obsidian.d.ts's own documented rule). This is what lets the
 * same assertions run unchanged before and after the migration.
 */
function renderTab(tab) {
  mod.__resetCreatedSettings();
  const defs =
    typeof tab.getSettingDefinitions === "function" ? tab.getSettingDefinitions() : [];
  if (Array.isArray(defs) && defs.length > 0) {
    walkDefinitions(tab.containerEl, defs);
  } else {
    tab.containerEl.empty();
    tab.display();
  }
  return snapshot();
}

function snapshot() {
  return mod.createdSettings.map((s) => ({
    name: s.name,
    desc: s.desc,
    heading: s.isHeading,
    controls: s.controls.map((c) => ({
      kind: c.kind,
      value: c.value,
      placeholder: c.placeholder,
      options: c.options?.map((o) => ({ value: o.value, label: o.label })),
      disabled: c.disabled,
      cta: c.cta,
      destructive: c.destructive,
      buttonText: c.buttonText,
    })),
  }));
}

function findRow(rows, matcher) {
  const row = rows.find(matcher);
  assert.ok(row, `no row matched ${matcher.toString()}`);
  return row;
}
function rawRow(matcher) {
  return mod.createdSettings.find(matcher);
}

// --- structure: row presence/order per auth method, cliModelCustom,
// modelLists combination --------------------------------------------------

const AUTH_METHODS = ["claude-code-cli", "anthropic-api", "openai-compat"];

for (const authMethod of AUTH_METHODS) {
  for (const cliModelCustom of authMethod === "claude-code-cli" ? [false, true] : [false]) {
    for (const modelLoaded of authMethod !== "claude-code-cli" ? [false, true] : [false]) {
      const label = `authMethod=${authMethod} cliModelCustom=${cliModelCustom} modelLoaded=${modelLoaded}`;
      const plugin = makeFakePlugin({ authMethod });
      const tab = new ExcaveloSettingTab({}, plugin);
      tab.cliModelCustom = cliModelCustom;
      if (modelLoaded) {
        const cacheKey = authMethod === "anthropic-api" ? "anthropic" : "openai";
        tab.modelLists = { [cacheKey]: ["model-a", "model-b"] };
      }

      const rows = renderTab(tab);

      check(`${label} — containerEl carries excavelo-settings class`, () => {
        assert.ok(tab.containerEl.classes.has("excavelo-settings"));
      });

      check(`${label} — title heading row present, before the language row`, () => {
        const titleIdx = rows.findIndex((r) => r.heading && r.name === t("settings.title"));
        const langIdx = rows.findIndex(
          (r) => ctrl(r, "dropdown")?.value === plugin.settings.language && ctrl(r, "dropdown")?.options?.some((o) => o.value === "auto")
        );
        assert.ok(titleIdx >= 0, "title heading row missing");
        assert.ok(langIdx > titleIdx, "language dropdown is not after the title heading");
      });

      check(`${label} — exactly one auth-method sub-section's rows are present`, () => {
        const binaryPathRow = rows.some((r) => ctrl(r, "text")?.placeholder === t("settings.cli.binary.placeholder"));
        if (authMethod === "claude-code-cli") assert.ok(binaryPathRow, "CLI binary path row missing");
        else assert.ok(!binaryPathRow, "CLI binary path row leaked into a non-CLI auth method");
      });

      check(`${label} — CLI custom-model text row visibility matches cliModelCustom`, () => {
        if (authMethod !== "claude-code-cli") return;
        const customRow = rows.some((r) => ctrl(r, "text")?.placeholder === "claude-sonnet-4-6");
        assert.equal(customRow, cliModelCustom, "custom-model row visibility mismatch");
      });

      check(`${label} — shared model picker renders text vs. dropdown per modelLists`, () => {
        if (authMethod === "claude-code-cli") return;
        const dropdownRow = rows.some((r) => ctrl(r, "dropdown")?.options?.some((o) => o.value === "model-a"));
        assert.equal(dropdownRow, modelLoaded, "model picker control kind does not match modelLists state");
      });

      check(`${label} — Test Connection button has no visible label, only a CTA button`, () => {
        const testRow = rows.find((r) => {
          const b = ctrl(r, "button");
          return b?.buttonText === t("settings.test-connection.button") && b?.cta === true;
        });
        assert.ok(testRow, "Test Connection button row missing");
        assert.ok(!testRow.name, "Test Connection row must render with no visible label text");
        assert.ok(!testRow.desc, "Test Connection row must render with no visible desc text");
      });
    }
  }
}

// --- onChange / onClick behavior ------------------------------------------

await checkAsync("language dropdown onChange writes settings.language and calls saveSettings", async () => {
  const plugin = makeFakePlugin();
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  const row = rawRow((r) => ctrl(r, "dropdown")?.options?.some((o) => o.value === "ko"));
  await ctrl(row, "dropdown").onChangeFn("ko");
  assert.equal(plugin.settings.language, "ko");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
});

await checkAsync("auth-method dropdown onChange writes settings.authMethod and calls saveSettings", async () => {
  const plugin = makeFakePlugin();
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  const row = rawRow((r) => ctrl(r, "dropdown")?.options?.some((o) => o.value === "openai-compat"));
  await ctrl(row, "dropdown").onChangeFn("openai-compat");
  assert.equal(plugin.settings.authMethod, "openai-compat");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
});

await checkAsync("CLI timeout field ignores non-finite/<=0 input, keeps prior value", async () => {
  const plugin = makeFakePlugin({ authMethod: "claude-code-cli" });
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  const row = rawRow((r) => ctrl(r, "text")?.placeholder === "720");
  const c = ctrl(row, "text");
  await c.onChangeFn("0");
  assert.equal(plugin.settings.claudeCodeCli.timeoutSeconds, 720, "0 must be ignored");
  await c.onChangeFn("not-a-number");
  assert.equal(plugin.settings.claudeCodeCli.timeoutSeconds, 720, "NaN must be ignored");
  await c.onChangeFn("90");
  assert.equal(plugin.settings.claudeCodeCli.timeoutSeconds, 90, "a valid positive integer must persist");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 1, "saveSettings must be called only for the accepted change");
});

await checkAsync("default-context textarea onChange writes settings.defaultContext", async () => {
  const plugin = makeFakePlugin();
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  const row = rawRow((r) => ctrl(r, "textarea"));
  await ctrl(row, "textarea").onChangeFn("some context text");
  assert.equal(plugin.settings.defaultContext, "some context text");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
});

await checkAsync("status-bar / show-cost toggles write their settings independently", async () => {
  const plugin = makeFakePlugin();
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  const toggles = mod.createdSettings.filter((r) => ctrl(r, "toggle"));
  assert.equal(toggles.length, 2, "expected exactly 2 toggles (status bar, show cost)");
  await ctrl(toggles[0], "toggle").onChangeFn(false);
  await ctrl(toggles[1], "toggle").onChangeFn(false);
  assert.equal(plugin.settings.showStatusBar, false);
  assert.equal(plugin.settings.showCostInPreview, false);
  assert.equal(plugin.__probe.saveSettingsCalls.length, 2);
});

await checkAsync("open-templates-folder / restore-starter / update-starter buttons fire their plugin calls", async () => {
  const plugin = makeFakePlugin();
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  const openRow = rawRow((r) => ctrl(r, "button")?.buttonText === t("settings.open-templates-folder.button"));
  assert.ok(openRow, "open-templates-folder row missing");
  assert.ok(!openRow.name, "open-templates-folder row must render with no visible label");
  await ctrl(openRow, "button").onClickFn();
  assert.equal(plugin.__probe.openTemplatesFolderCalls.length, 1);

  const restoreRow = rawRow((r) => ctrl(r, "button")?.buttonText === t("settings.restore-starter.button"));
  await ctrl(restoreRow, "button").onClickFn();
  assert.deepEqual(plugin.__probe.templatesCalls, ["restore"]);
  assert.equal(noticeLog.at(-1), t("settings.restore-starter.notice"));

  const updateRow = rawRow((r) => ctrl(r, "button")?.buttonText === t("settings.update-starter.button"));
  assert.equal(ctrl(updateRow, "button").destructive, true, "update-starter must be a destructive button");
  await ctrl(updateRow, "button").onClickFn();
  assert.deepEqual(plugin.__probe.templatesCalls, ["restore", "update"]);
  assert.equal(noticeLog.at(-1), t("settings.update-starter.notice"));
});

// --- Load model list: success and failure ---------------------------------

await checkAsync("Load model list (anthropic) success populates modelLists and re-renders as a dropdown", async () => {
  const plugin = makeFakePlugin({ authMethod: "anthropic-api", anthropicApi: { apiKey: "sk-ant-test", model: "" } });
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  mod.__setRequestUrlHandler(async () => ({
    status: 200,
    text: JSON.stringify({ data: [{ id: "claude-x" }, { id: "claude-y" }] }),
  }));
  const loadBtn = rawRow((r) => ctrl(r, "button")?.buttonText === t("settings.api-model.load"));
  await ctrl(loadBtn, "button").onClickFn();
  assert.deepEqual(tab.modelLists.anthropic, ["claude-x", "claude-y"]);
  const afterRows = renderTab(tab);
  const dropdownRow = findRow(afterRows, (r) => ctrl(r, "dropdown")?.options?.some((o) => o.value === "claude-x"));
  assert.ok(dropdownRow, "model picker did not become a dropdown after a successful load");
});

await checkAsync("Load model list (openai-compat) failure shows a Notice and leaves the text field in place", async () => {
  const plugin = makeFakePlugin({ authMethod: "openai-compat", openAiCompat: { baseUrl: "http://localhost:1234", apiKey: "", model: "" } });
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  mod.__setRequestUrlHandler(async () => ({ status: 500, text: "boom" }));
  const loadBtn = rawRow((r) => ctrl(r, "button")?.buttonText === t("settings.api-model.load"));
  await ctrl(loadBtn, "button").onClickFn();
  assert.equal(tab.modelLists?.openai, undefined, "a failed load must not populate modelLists");
  assert.ok(String(noticeLog.at(-1)).includes("Endpoint error 500"), "failure Notice must surface the provider's error detail");
});

// --- Test connection: ok, not-ok, and throwing -----------------------------

await checkAsync("Test connection: ok result shows the ok Notice", async () => {
  const plugin = makeFakePlugin({ authMethod: "claude-code-cli" });
  plugin.__probe.pingState.result = { ok: true, detail: "all good" };
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  const btn = rawRow((r) => ctrl(r, "button")?.buttonText === t("settings.test-connection.button"));
  await ctrl(btn, "button").onClickFn();
  assert.equal(noticeLog.at(-1), t("settings.test-connection.ok", { detail: "all good" }));
});

await checkAsync("Test connection: not-ok result shows the fail Notice", async () => {
  const plugin = makeFakePlugin({ authMethod: "claude-code-cli" });
  plugin.__probe.pingState.result = { ok: false, detail: "bad key" };
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  const btn = rawRow((r) => ctrl(r, "button")?.buttonText === t("settings.test-connection.button"));
  await ctrl(btn, "button").onClickFn();
  assert.equal(noticeLog.at(-1), t("settings.test-connection.fail", { detail: "bad key" }));
});

await checkAsync("Test connection: a thrown error is caught and shown as the fail Notice", async () => {
  const plugin = makeFakePlugin({ authMethod: "claude-code-cli" });
  plugin.__probe.pingState.throws = new Error("network down");
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  const btn = rawRow((r) => ctrl(r, "button")?.buttonText === t("settings.test-connection.button"));
  await ctrl(btn, "button").onClickFn();
  assert.equal(noticeLog.at(-1), t("settings.test-connection.fail", { detail: "network down" }));
});

// ---------------------------------------------------------------------------

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
