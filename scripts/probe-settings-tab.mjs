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
 * Revised per docs/specs/settings-dual-path.md: the tab is dual-path now —
 * getSettingDefinitions() on 1.13+, a display() interpreter fallback below.
 * The stub gains a flag-based `requireApiVersion` (`__setApiVersionSupported`)
 * so both branches are drivable; the structure matrix runs against both render
 * paths and asserts their snapshots equal (version-branched fields excepted).
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

let apiVersionSupported = true;
export function __setApiVersionSupported(v) {
  apiVersionSupported = v;
}
export function requireApiVersion(_version) {
  return apiVersionSupported;
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
  const c = {
    kind,
    options: [],
    disabled: false,
    cta: false,
    destructive: false,
    inputEl: {},
    buttonEl: {
      classes: [],
      addClass(...cs) {
        for (const x of cs) this.classes.push(x);
      },
    },
  };
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
      `export { Setting, noticeLog, __setRequestUrlHandler, __setApiVersionSupported, createdSettings, __resetCreatedSettings } from "obsidian";\n` +
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
      buttonElClasses: c.buttonEl ? [...c.buttonEl.classes] : [],
      buttonText: c.buttonText,
    })),
  }));
}

/**
 * Renders the tab the way Obsidian <1.13 does: display() only — the
 * declarative API does not exist there. The caller must set the stub's
 * api-version flag to false first (version-branched render details like the
 * destructive button live inside render callbacks and read the flag).
 */
function renderFallback(tab) {
  mod.__resetCreatedSettings();
  tab.display();
  return snapshot();
}

// Version-branched fields (setDestructive on 1.13+ vs mod-warning below —
// contract §Spec "setDestructive 가드") are asserted per-path in dedicated
// checks; strip them before the cross-path deepEqual (Preservation 2's
// explicit exception).
function stripVersionBranchedFields(rows) {
  return rows?.map((r) => ({
    ...r,
    controls: r.controls.map(({ destructive, buttonElClasses, ...rest }) => rest),
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
// modelLists combination — run through BOTH render paths (declarative walk
// and the <1.13 display() fallback), then cross-checked for equality
// (contract settings-dual-path §Spec 프로브 개정 2 / Preservation 2) ---------

const AUTH_METHODS = ["claude-code-cli", "anthropic-api", "openai-compat"];

for (const authMethod of AUTH_METHODS) {
  for (const cliModelCustom of authMethod === "claude-code-cli" ? [false, true] : [false]) {
    for (const modelLoaded of authMethod !== "claude-code-cli" ? [false, true] : [false]) {
      const label = `authMethod=${authMethod} cliModelCustom=${cliModelCustom} modelLoaded=${modelLoaded}`;
      const makeFixtureTab = () => {
        const plugin = makeFakePlugin({ authMethod });
        const tab = new ExcaveloSettingTab({}, plugin);
        tab.cliModelCustom = cliModelCustom;
        if (modelLoaded) {
          const cacheKey = authMethod === "anthropic-api" ? "anthropic" : "openai";
          tab.modelLists = { [cacheKey]: ["model-a", "model-b"] };
        }
        return { plugin, tab };
      };

      const pathSnapshots = {};
      for (const pathName of ["declarative", "fallback"]) {
        let plugin;
        let tab;
        let rows = [];

        check(`${label} [${pathName}] — render succeeds`, () => {
          ({ plugin, tab } = makeFixtureTab());
          if (pathName === "fallback") {
            mod.__setApiVersionSupported(false);
            try {
              rows = renderFallback(tab);
            } finally {
              mod.__setApiVersionSupported(true);
            }
          } else {
            rows = renderTab(tab);
          }
          pathSnapshots[pathName] = rows;
        });

        check(`${label} [${pathName}] — containerEl carries excavelo-settings class`, () => {
          assert.ok(tab.containerEl.classes.has("excavelo-settings"));
        });

        check(`${label} [${pathName}] — title heading row present, before the language row`, () => {
          const titleIdx = rows.findIndex((r) => r.heading && r.name === t("settings.title"));
          const langIdx = rows.findIndex(
            (r) => ctrl(r, "dropdown")?.value === plugin.settings.language && ctrl(r, "dropdown")?.options?.some((o) => o.value === "auto")
          );
          assert.ok(titleIdx >= 0, "title heading row missing");
          assert.ok(langIdx > titleIdx, "language dropdown is not after the title heading");
        });

        check(`${label} [${pathName}] — exactly one auth-method sub-section's rows are present`, () => {
          const binaryPathRow = rows.some((r) => ctrl(r, "text")?.placeholder === t("settings.cli.binary.placeholder"));
          if (authMethod === "claude-code-cli") assert.ok(binaryPathRow, "CLI binary path row missing");
          else assert.ok(!binaryPathRow, "CLI binary path row leaked into a non-CLI auth method");
        });

        check(`${label} [${pathName}] — CLI custom-model text row visibility matches cliModelCustom`, () => {
          if (authMethod !== "claude-code-cli") return;
          const customRow = rows.some((r) => ctrl(r, "text")?.placeholder === "claude-sonnet-4-6");
          assert.equal(customRow, cliModelCustom, "custom-model row visibility mismatch");
        });

        check(`${label} [${pathName}] — shared model picker renders text vs. dropdown per modelLists`, () => {
          if (authMethod === "claude-code-cli") return;
          const dropdownRow = rows.some((r) => ctrl(r, "dropdown")?.options?.some((o) => o.value === "model-a"));
          assert.equal(dropdownRow, modelLoaded, "model picker control kind does not match modelLists state");
        });

        check(`${label} [${pathName}] — shared model picker desc reflects load state (Preservation item 5)`, () => {
          if (authMethod === "claude-code-cli") return;
          const row = rows.find((r) => r.name === t("settings.api-model.name"));
          assert.ok(row, "api-model row missing");
          const expectedDesc = modelLoaded
            ? t("settings.api-model.desc-loaded", { count: 2 })
            : t("settings.api-model.desc-text");
          assert.equal(row.desc, expectedDesc, "api-model desc must reflect current load state");
        });

        check(`${label} [${pathName}] — Test Connection button has no visible label, only a CTA button`, () => {
          const testRow = rows.find((r) => {
            const b = ctrl(r, "button");
            return b?.buttonText === t("settings.test-connection.button") && b?.cta === true;
          });
          assert.ok(testRow, "Test Connection button row missing");
          assert.ok(!testRow.name, "Test Connection row must render with no visible label text");
          assert.ok(!testRow.desc, "Test Connection row must render with no visible desc text");
        });
      }

      check(`${label} — fallback render matches declarative render (Preservation 2)`, () => {
        assert.ok(pathSnapshots.declarative?.length, "declarative snapshot missing");
        assert.ok(pathSnapshots.fallback?.length, "fallback snapshot missing");
        assert.deepEqual(
          stripVersionBranchedFields(pathSnapshots.fallback),
          stripVersionBranchedFields(pathSnapshots.declarative)
        );
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
// Recall pass (test-author, Trigger 2) — closing gaps the original
// characterization pass left uncovered against the confirmed contract
// (docs/specs/settings-tab-declarative-definitions.md). These are spec
// assertions against the confirmed contract, not characterization of an
// unverified prior state, so they are written and run against migrated code
// only.
// ---------------------------------------------------------------------------

// Old SC2 ("display() removed entirely") is superseded by
// docs/specs/settings-dual-path.md: display() is reinstated as the <1.13
// fallback interpreter over the same definition tree.
check("display() exists as the <1.13 fallback (settings-dual-path supersedes SC2)", () => {
  assert.equal(
    typeof ExcaveloSettingTab.prototype.display,
    "function",
    "ExcaveloSettingTab must define display() as the <1.13 fallback (settings-dual-path §Spec)"
  );
});

check("fallback render (api-version flag false) produces rows", () => {
  mod.__setApiVersionSupported(false);
  try {
    const plugin = makeFakePlugin();
    const tab = new ExcaveloSettingTab({}, plugin);
    const rows = renderFallback(tab);
    assert.ok(rows.length > 0, "display() fallback must render rows");
  } finally {
    mod.__setApiVersionSupported(true);
  }
});

function cloneSettings(plugin) {
  return JSON.parse(JSON.stringify(plugin.settings));
}
function readPath(obj, path) {
  return path.reduce((o, k) => o[k], obj);
}
// I1 — no cross-field coupling: everything in plugin.settings other than the
// given path must be byte-identical before/after a handler runs.
function assertOnlyPathChanged(before, after, path) {
  const expected = JSON.parse(JSON.stringify(before));
  let cursor = expected;
  for (let i = 0; i < path.length - 1; i++) cursor = cursor[path[i]];
  cursor[path[path.length - 1]] = readPath(after, path);
  assert.deepEqual(
    after,
    expected,
    `unexpected mutation outside plugin.settings.${path.join(".")} (I1 — no cross-field coupling)`
  );
}

// --- SC5 / Preservation contract: row name/desc text preserved -----------

{
  const plugin = makeFakePlugin();
  const tab = new ExcaveloSettingTab({}, plugin);
  const rows = renderTab(tab);

  const expectedNameDesc = [
    ["settings.language.name", "settings.language.desc"],
    ["settings.auth-method.name", "settings.auth-method.desc"],
    ["settings.cli.binary.name", "settings.cli.binary.desc"],
    ["settings.cli.model.name", "settings.cli.model.desc"],
    ["settings.cli.timeout.name", "settings.cli.timeout.desc"],
    ["settings.default-context.name", "settings.default-context.desc"],
    ["settings.restore-starter.name", "settings.restore-starter.desc"],
    ["settings.update-starter.name", "settings.update-starter.desc"],
    ["settings.status-bar.name", "settings.status-bar.desc"],
    ["settings.show-cost.name", "settings.show-cost.desc"],
    ["settings.api-model.name", null],
  ];
  for (const [nameKey, descKey] of expectedNameDesc) {
    check(`row name/desc preserved — ${nameKey} (SC5)`, () => {
      const row = findRow(rows, (r) => r.name === t(nameKey));
      if (descKey) assert.equal(row.desc, t(descKey), `desc mismatch for ${nameKey}`);
    });
  }

  check("section headings preserved (Preservation items 3/7/8/10)", () => {
    for (const key of [
      "settings.connection.header",
      "settings.context.header",
      "settings.templates.header",
      "settings.ui.header",
    ]) {
      assert.ok(rows.some((r) => r.heading && r.name === t(key)), `heading missing: ${key}`);
    }
  });

  check("default-context textarea keeps rows=6 (Preservation item 7)", () => {
    const row = rawRow((r) => ctrl(r, "textarea"));
    assert.equal(ctrl(row, "textarea").inputEl.rows, 6);
  });

  check("CLI custom-model row name/desc preserved while rendered (SC5)", () => {
    tab.cliModelCustom = true;
    const customRows = renderTab(tab);
    const row = findRow(customRows, (r) => r.name === t("settings.cli.custom-model.name"));
    assert.equal(row.desc, t("settings.cli.custom-model.desc"));
  });
}

{
  const plugin = makeFakePlugin({ authMethod: "anthropic-api" });
  const tab = new ExcaveloSettingTab({}, plugin);
  const rows = renderTab(tab);
  check(
    "anthropic API key row name/desc preserved and is a password field (SC5, Preservation item 4)",
    () => {
      const row = findRow(rows, (r) => r.name === t("settings.anthropic.key.name"));
      assert.equal(row.desc, t("settings.anthropic.key.desc"));
      const liveRow = rawRow((r) => r.name === t("settings.anthropic.key.name"));
      assert.equal(ctrl(liveRow, "text").inputEl.type, "password");
    }
  );
}

// --- I2 — getSettingDefinitions() itself never mutates plugin.settings ---

check("getSettingDefinitions()/render() alone never mutates settings or calls saveSettings (I2)", () => {
  const plugin = makeFakePlugin({ authMethod: "anthropic-api" });
  const tab = new ExcaveloSettingTab({}, plugin);
  const before = cloneSettings(plugin);
  renderTab(tab);
  renderTab(tab);
  tab.cliModelCustom = true;
  renderTab(tab);
  assert.deepEqual(plugin.settings, before, "rendering alone must not mutate plugin.settings");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 0, "rendering alone must not call saveSettings");
});

// --- I3 — modelLists/cliModelCustom never touch plugin.settings ----------

check("modelLists and cliModelCustom are never present on plugin.settings (I3)", () => {
  const plugin = makeFakePlugin({ authMethod: "anthropic-api" });
  const tab = new ExcaveloSettingTab({}, plugin);
  tab.cliModelCustom = true;
  tab.modelLists = { anthropic: ["m1"] };
  renderTab(tab);
  assert.equal(plugin.settings.modelLists, undefined);
  assert.equal(plugin.settings.cliModelCustom, undefined);
  assert.deepEqual(Object.keys(plugin.settings).sort(), Object.keys(defaultSettings()).sort());
});

// --- Untested onChange write-paths (Preservation item 12) -----------------

await checkAsync("CLI binary path text onChange writes settings.claudeCodeCli.binaryPath", async () => {
  const plugin = makeFakePlugin({ authMethod: "claude-code-cli" });
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  let updateCalls = 0;
  tab.update = () => {
    updateCalls += 1;
  };
  const row = rawRow((r) => ctrl(r, "text")?.placeholder === t("settings.cli.binary.placeholder"));
  const before = cloneSettings(plugin);
  await ctrl(row, "text").onChangeFn("/usr/local/bin/claude");
  assert.equal(plugin.settings.claudeCodeCli.binaryPath, "/usr/local/bin/claude");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
  assert.equal(updateCalls, 0, "binaryPath change is not one of the 4 update() call sites (SC3)");
  assertOnlyPathChanged(before, plugin.settings, ["claudeCodeCli", "binaryPath"]);
});

await checkAsync(
  "CLI model dropdown: selecting a concrete alias writes settings, clears custom mode, calls this.update()",
  async () => {
    const plugin = makeFakePlugin({ authMethod: "claude-code-cli" });
    const tab = new ExcaveloSettingTab({}, plugin);
    tab.cliModelCustom = true;
    renderTab(tab);
    let updateCalls = 0;
    tab.update = () => {
      updateCalls += 1;
    };
    const row = rawRow((r) => ctrl(r, "dropdown")?.options?.some((o) => o.value === "opus"));
    const before = cloneSettings(plugin);
    await ctrl(row, "dropdown").onChangeFn("opus");
    assert.equal(plugin.settings.claudeCodeCli.model, "opus");
    assert.equal(tab.cliModelCustom, false, "custom mode must clear when a concrete alias is chosen");
    assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
    assert.equal(updateCalls, 1, "must call this.update() (SC3)");
    assertOnlyPathChanged(before, plugin.settings, ["claudeCodeCli", "model"]);
  }
);

await checkAsync(
  "CLI model dropdown: selecting __custom__ enters custom mode without writing settings",
  async () => {
    const plugin = makeFakePlugin({ authMethod: "claude-code-cli" });
    const tab = new ExcaveloSettingTab({}, plugin);
    renderTab(tab);
    let updateCalls = 0;
    tab.update = () => {
      updateCalls += 1;
    };
    const row = rawRow((r) => ctrl(r, "dropdown")?.options?.some((o) => o.value === "__custom__"));
    const before = cloneSettings(plugin);
    await ctrl(row, "dropdown").onChangeFn("__custom__");
    assert.equal(tab.cliModelCustom, true);
    assert.deepEqual(plugin.settings, before, "selecting __custom__ must not write plugin.settings");
    assert.equal(plugin.__probe.saveSettingsCalls.length, 0, "selecting __custom__ must not call saveSettings");
    assert.equal(updateCalls, 1, "must still call this.update() (SC3)");
  }
);

await checkAsync("CLI custom-model text onChange trims and writes settings.claudeCodeCli.model", async () => {
  const plugin = makeFakePlugin({ authMethod: "claude-code-cli" });
  const tab = new ExcaveloSettingTab({}, plugin);
  tab.cliModelCustom = true;
  renderTab(tab);
  const row = rawRow((r) => ctrl(r, "text")?.placeholder === "claude-sonnet-4-6");
  const before = cloneSettings(plugin);
  await ctrl(row, "text").onChangeFn("  my-custom-model  ");
  assert.equal(plugin.settings.claudeCodeCli.model, "my-custom-model", "input must be trimmed");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
  assertOnlyPathChanged(before, plugin.settings, ["claudeCodeCli", "model"]);
});

await checkAsync(
  "CLI permission-mode dropdown renders default/bypassPermissions; onChange writes settings",
  async () => {
    const plugin = makeFakePlugin({ authMethod: "claude-code-cli" });
    const tab = new ExcaveloSettingTab({}, plugin);
    const rows = renderTab(tab);
    const row = findRow(rows, (r) => r.name === t("settings.cli.permission.name"));
    assert.equal(row.desc, t("settings.cli.permission.desc"));
    assert.deepEqual(
      ctrl(row, "dropdown").options.map((o) => o.value),
      ["default", "bypassPermissions"]
    );

    let updateCalls = 0;
    tab.update = () => {
      updateCalls += 1;
    };
    const liveRow = rawRow((r) => r.name === t("settings.cli.permission.name"));
    const before = cloneSettings(plugin);
    await ctrl(liveRow, "dropdown").onChangeFn("bypassPermissions");
    assert.equal(plugin.settings.claudeCodeCli.permissionMode, "bypassPermissions");
    assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
    assert.equal(updateCalls, 0, "permission-mode change is not one of the 4 update() call sites (SC3)");
    assertOnlyPathChanged(before, plugin.settings, ["claudeCodeCli", "permissionMode"]);
  }
);

await checkAsync("Anthropic API key text onChange writes settings.anthropicApi.apiKey", async () => {
  const plugin = makeFakePlugin({ authMethod: "anthropic-api" });
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  const row = rawRow((r) => ctrl(r, "text")?.placeholder === "sk-ant-...");
  const before = cloneSettings(plugin);
  await ctrl(row, "text").onChangeFn("sk-ant-abc123");
  assert.equal(plugin.settings.anthropicApi.apiKey, "sk-ant-abc123");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
  assertOnlyPathChanged(before, plugin.settings, ["anthropicApi", "apiKey"]);
});

await checkAsync("OpenAI-compat base URL text onChange writes settings.openAiCompat.baseUrl", async () => {
  const plugin = makeFakePlugin({ authMethod: "openai-compat" });
  const tab = new ExcaveloSettingTab({}, plugin);
  const rows = renderTab(tab);
  const row = findRow(rows, (r) => r.name === t("settings.openai.baseurl.name"));
  assert.equal(row.desc, t("settings.openai.baseurl.desc"));
  const liveRow = rawRow((r) => r.name === t("settings.openai.baseurl.name"));
  const before = cloneSettings(plugin);
  await ctrl(liveRow, "text").onChangeFn("http://localhost:9999");
  assert.equal(plugin.settings.openAiCompat.baseUrl, "http://localhost:9999");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
  assertOnlyPathChanged(before, plugin.settings, ["openAiCompat", "baseUrl"]);
});

await checkAsync("OpenAI-compat API key text onChange writes settings.openAiCompat.apiKey", async () => {
  const plugin = makeFakePlugin({ authMethod: "openai-compat" });
  const tab = new ExcaveloSettingTab({}, plugin);
  const rows = renderTab(tab);
  const row = findRow(rows, (r) => r.name === t("settings.openai.key.name"));
  assert.equal(row.desc, t("settings.openai.key.desc"));
  const liveRow = rawRow((r) => r.name === t("settings.openai.key.name"));
  assert.equal(ctrl(liveRow, "text").inputEl.type, "password");
  const before = cloneSettings(plugin);
  await ctrl(liveRow, "text").onChangeFn("secret-key");
  assert.equal(plugin.settings.openAiCompat.apiKey, "secret-key");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
  assertOnlyPathChanged(before, plugin.settings, ["openAiCompat", "apiKey"]);
});

await checkAsync("templates-folder text onChange writes settings.templatesFolder", async () => {
  const plugin = makeFakePlugin();
  const tab = new ExcaveloSettingTab({}, plugin);
  const rows = renderTab(tab);
  const row = findRow(rows, (r) => r.name === t("settings.templates-folder.name"));
  assert.equal(row.desc, t("settings.templates-folder.desc"));
  const liveRow = rawRow((r) => r.name === t("settings.templates-folder.name"));
  const before = cloneSettings(plugin);
  await ctrl(liveRow, "text").onChangeFn("Templates/");
  assert.equal(plugin.settings.templatesFolder, "Templates/");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
  assertOnlyPathChanged(before, plugin.settings, ["templatesFolder"]);
});

await checkAsync("default-template text onChange writes settings.defaultTemplate", async () => {
  const plugin = makeFakePlugin();
  const tab = new ExcaveloSettingTab({}, plugin);
  const rows = renderTab(tab);
  const row = findRow(rows, (r) => r.name === t("settings.default-template.name"));
  assert.equal(row.desc, t("settings.default-template.desc"));
  const liveRow = rawRow((r) => r.name === t("settings.default-template.name"));
  const before = cloneSettings(plugin);
  await ctrl(liveRow, "text").onChangeFn("MyTemplate.md");
  assert.equal(plugin.settings.defaultTemplate, "MyTemplate.md");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
  assertOnlyPathChanged(before, plugin.settings, ["defaultTemplate"]);
});

await checkAsync("shared model picker text-field onChange writes the model (anthropic), trimmed", async () => {
  const plugin = makeFakePlugin({ authMethod: "anthropic-api" });
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  const row = rawRow((r) => r.name === t("settings.api-model.name"));
  const before = cloneSettings(plugin);
  await ctrl(row, "text").onChangeFn("  claude-custom  ");
  assert.equal(plugin.settings.anthropicApi.model, "claude-custom", "input must be trimmed");
  assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
  assertOnlyPathChanged(before, plugin.settings, ["anthropicApi", "model"]);
});

await checkAsync(
  "shared model picker dropdown onChange writes the model (openai-compat), untrimmed",
  async () => {
    const plugin = makeFakePlugin({ authMethod: "openai-compat" });
    const tab = new ExcaveloSettingTab({}, plugin);
    tab.modelLists = { openai: ["gpt-a", "gpt-b"] };
    renderTab(tab);
    const row = rawRow((r) => ctrl(r, "dropdown")?.options?.some((o) => o.value === "gpt-b"));
    const before = cloneSettings(plugin);
    await ctrl(row, "dropdown").onChangeFn("gpt-b");
    assert.equal(plugin.settings.openAiCompat.model, "gpt-b");
    assert.equal(plugin.__probe.saveSettingsCalls.length, 1);
    assertOnlyPathChanged(before, plugin.settings, ["openAiCompat", "model"]);
  }
);

// --- SC3 — the remaining update()-on-re-render call sites -----------------

await checkAsync("language dropdown onChange calls this.update() (SC3)", async () => {
  const plugin = makeFakePlugin();
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  let updateCalls = 0;
  tab.update = () => {
    updateCalls += 1;
  };
  const row = rawRow((r) => ctrl(r, "dropdown")?.options?.some((o) => o.value === "ko"));
  await ctrl(row, "dropdown").onChangeFn("ko");
  assert.equal(updateCalls, 1);
});

await checkAsync("auth-method dropdown onChange calls this.update() (SC3)", async () => {
  const plugin = makeFakePlugin();
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  let updateCalls = 0;
  tab.update = () => {
    updateCalls += 1;
  };
  const row = rawRow((r) => ctrl(r, "dropdown")?.options?.some((o) => o.value === "openai-compat"));
  await ctrl(row, "dropdown").onChangeFn("openai-compat");
  assert.equal(updateCalls, 1);
});

await checkAsync("model-list load success calls this.update() (SC3)", async () => {
  const plugin = makeFakePlugin({
    authMethod: "anthropic-api",
    anthropicApi: { apiKey: "sk-ant-test", model: "" },
  });
  const tab = new ExcaveloSettingTab({}, plugin);
  renderTab(tab);
  mod.__setRequestUrlHandler(async () => ({
    status: 200,
    text: JSON.stringify({ data: [{ id: "claude-x" }] }),
  }));
  let updateCalls = 0;
  tab.update = () => {
    updateCalls += 1;
  };
  const loadBtn = rawRow((r) => ctrl(r, "button")?.buttonText === t("settings.api-model.load"));
  await ctrl(loadBtn, "button").onClickFn();
  assert.equal(updateCalls, 1);
});

// --- settings-dual-path: refresh()/setDestructive version branches ---------
// Flag-true expectations are the existing SC3 update() checks above and the
// destructive===true assertion in the update-starter check; these cover the
// flag-false (<1.13) side.

await checkAsync(
  "auth-method onChange with api-version flag false re-renders via display(), not update() (refresh fallback branch)",
  async () => {
    const plugin = makeFakePlugin();
    const tab = new ExcaveloSettingTab({}, plugin);
    mod.__setApiVersionSupported(false);
    try {
      renderFallback(tab);
      let updateCalls = 0;
      tab.update = () => {
        updateCalls += 1;
      };
      const rowsBefore = mod.createdSettings.length;
      const row = rawRow((r) => ctrl(r, "dropdown")?.options?.some((o) => o.value === "openai-compat"));
      await ctrl(row, "dropdown").onChangeFn("openai-compat");
      assert.equal(updateCalls, 0, "below 1.13 the handler must not route through update()");
      assert.ok(
        mod.createdSettings.length > rowsBefore,
        "the handler must re-render through the display() fallback (new Setting rows created)"
      );
    } finally {
      mod.__setApiVersionSupported(true);
    }
  }
);

check("update-starter button below 1.13 gets mod-warning class instead of setDestructive()", () => {
  mod.__setApiVersionSupported(false);
  try {
    const plugin = makeFakePlugin();
    const tab = new ExcaveloSettingTab({}, plugin);
    renderFallback(tab);
    const row = rawRow((r) => ctrl(r, "button")?.buttonText === t("settings.update-starter.button"));
    const btn = ctrl(row, "button");
    assert.equal(btn.destructive, false, "setDestructive() must not be called below 1.13");
    assert.ok(btn.buttonEl.classes.includes("mod-warning"), "fallback must add the mod-warning class");
  } finally {
    mod.__setApiVersionSupported(true);
  }
});

// ---------------------------------------------------------------------------

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length > 0) {
  console.log(`\n${failures.length} failed`);
  process.exit(1);
}
console.log("\nall passed");
