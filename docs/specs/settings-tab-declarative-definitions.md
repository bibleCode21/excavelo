---
status: confirmed
ceremony: standard
approved-commit: 81510f9106146062656228344503ea2184f46b1c
---
# `ExcaveloSettingTab`: adopt `getSettingDefinitions()` for Obsidian 1.13+ settings search

## §Why

- **Goal** — implement `getSettingDefinitions()` on `ExcaveloSettingTab` so every individual setting row is indexed by Obsidian's 1.13+ settings search. 1.4.2 raised `minAppVersion` to 1.13.0, so every user of this plugin is now on a version where a `PluginSettingTab` without `getSettingDefinitions()` is invisible to that search — before 1.4.2 this only affected users already on 1.13+; now it affects all of them. Fine-grained: each currently-rendered `Setting` row gets its own declarative item (own `name`/`desc`), not one row per section — a coarse per-section wrap would leave individual fields (e.g. "CLI timeout") unsearchable, which fails the actual goal.
- **Non-goals** — no new runtime or dev dependency (no jsdom, no test framework); no change to `plugin.settings`'s shape or to any `t()` i18n key; no change to LLM provider logic (`AnthropicProvider`, `OpenAiCompatProvider`); no `control`-based (declarative-bound) rewrite of the three stateful widgets (custom-model reveal, model-list load/cache, test-connection ping) — these keep using the `SettingDefinitionRender` escape hatch, unchanged internally; none of the other 64 `obsidianmd/recommended` findings tracked separately (deferred item 4) are addressed here; no CI wiring.
- **Success criteria**
  1. `ExcaveloSettingTab` implements `getSettingDefinitions(): SettingDefinitionItem[]`.
  2. The `display()` method is removed from the class entirely (Obsidian never calls it once `getSettingDefinitions()` returns non-empty — removing it is behavior-preserving, not a functional change).
  3. All 4 existing `this.display()` re-render calls become `this.update()`.
  4. `pnpm lint` reports zero findings from `obsidianmd/settings-tab/prefer-setting-definitions`, `obsidianmd/settings-tab/prefer-update-over-display`, `obsidianmd/settings-tab/no-deprecated-display`, and `@typescript-eslint/no-deprecated` on this file.
  5. Every row enumerated under "Preservation contract" below has a declarative item with its own `name`/`desc` string equal to the current `t()` call it replaces, or — for the two rows with no current `t()`-driven name/desc (Preservation contract items 6 and 9) — equal to the exact resolution stated there.
  6. `pnpm build` passes (`tsc -noEmit` + production esbuild).
  7. `node scripts/probe-settings-tab.mjs` (new characterization probe, written against pre-migration code first per the safety-net ordering below, then re-run unchanged against the migrated code) passes.
  8. Manual QA in a live Obsidian vault (not automated — the probe's structural-recording approach cannot observe Obsidian's actual renderer or its search index; this is the safety net's stated residual, not an omission): every field name from item 5 is found via Settings search; the settings tab renders the same fields in the same order under each of the three auth methods; toggling auth method, toggling the CLI custom-model field, clicking "Load model list" (success and failure), and clicking "Test connection" all behave as they did before the change.
- **Preservation contract** — every row and behavior below must survive with identical `plugin.settings` read/write semantics and identical visibility conditions:
  1. Top-level title heading (`t("settings.title")`, `.setHeading()`), always visible, above everything else including the language dropdown. **Resolution (like items 6/9): a `SettingDefinitionRender` item, `name: t("settings.title")`, no `desc`, `render(setting) => { setting.setName(t("settings.title")).setHeading(); }`** — `.setHeading()` (a zero-arg method on `Setting`) is only reachable through a `render` callback; no other `SettingDefinitionItem` variant exposes it for a standalone row (only `SettingDefinitionGroup.heading` reproduces heading styling, and item 1 is not a group).
  2. Language dropdown (`auto`/`ko`/`en`), always visible.
  3. Connection section heading; auth-method dropdown (`claude-code-cli`/`anthropic-api`/`openai-compat`), always visible.
  4. Exactly one auth-method sub-section visible at a time, selected by the dropdown's current value:
     - `claude-code-cli`: CLI binary path (text); CLI model dropdown (`sonnet`/`opus`/`haiku`/`""` default/`__custom__`) whose value is `__custom__` whenever `cliModelCustom` is true or the stored model is non-empty and not one of the three aliases; a custom-model text field shown only while that dropdown resolves to custom; permission-mode dropdown (`default`/`bypassPermissions`); timeout number field (placeholder `720`, `min=1`, non-finite or `<=0` input is ignored rather than persisted); a Test Connection button.
     - `anthropic-api`: API key password field; the shared model picker (below); a Test Connection button.
     - `openai-compat`: base URL text field; API key password field; the shared model picker; a Test Connection button.
  5. Shared model picker (`renderApiModelSetting`): renders a free-text field when `modelLists[cacheKey]` is unset, or a dropdown seeded from the cached list (plus a synthesized `"<current> (current)"` option when the stored value isn't in the list) once set; a Load/Reload button that disables itself and switches its label to a loading state while `fetchModels()` is in flight, repopulates `modelLists[cacheKey]` and re-renders on success, and on failure shows a `Notice` with the error message and restores the button. **Resolution**: `name: t("settings.api-model.name")`; static `desc: ""` on the definition (the two current `desc` variants — `t("settings.api-model.desc-loaded", {count})` vs `t("settings.api-model.desc-text")` — depend on `modelLists[cacheKey]` at render time, so `render(setting)` sets `setting.setDesc(...)` dynamically each call, exactly as `renderApiModelSetting` does today).
  6. Test Connection button (`renderTestConnection`, shared across all three auth methods): on click, disables itself, shows a loading label, calls `plugin.providerFor(method).ping()`, shows a `Notice` with the ok/fail detail (or the caught error's message), then restores the button. **`settings-tab.ts:291-315` calls no `.setName()`/`.setDesc()` on this row today — no label text renders, only the button.** Resolution: `name: t("settings.test-connection.button")` (the same key already used for `setButtonText`, so no new i18n key), `desc: ""`; inside `render(setting)`, explicitly call `setting.setName("").setDesc("")` before `.addButton(...)` so no visible label text is introduced — `name`/`desc` populate the row before `render()` runs (`SettingDefinitionBase.name`'s docstring: "used for rendering and search", `obsidian.d.ts:5992-5997`), so `render()` must explicitly clear them to keep this row's current no-label appearance.
  7. Context section: heading; default-context textarea, 6 rows.
  8. Templates section: heading; templates-folder text field; default-template text field; "restore starter" button (fires `Notice` on completion); "update starter" destructive button (fires `Notice` on completion).
  9. "Open templates folder" button (`settings-tab.ts:359-363`): on click, calls `plugin.openTemplatesFolder()`. Calls no `.setName()`/`.setDesc()` today either — same resolution as item 6: `name: t("settings.open-templates-folder.button")` (existing button-text key), `desc: ""`, and `render(setting)` explicitly clears `setting.setName("").setDesc("")` before `.addButton(...)`.
  10. UI section: heading; status-bar toggle; show-cost toggle.
  11. `modelLists` and `cliModelCustom` remain plain, unpersisted instance fields on the tab — they must not be moved into `plugin.settings` or otherwise persisted.
  12. Every field's `onChange` writes exactly the `plugin.settings.*` path it writes today and calls `plugin.saveSettings()` (except the two session-only fields in item 11, which never call it).
  13. `containerEl` keeps the `excavelo-settings` class (referenced by `styles.css`; two of its current descendant selectors — `.auth-method-card`, `.detection-status` — are dead CSS not used anywhere in `src`, pre-existing and out of scope here, not touched).
- **Refactor rationale** — `getSettingDefinitions()` requires each `renderXxx` method to produce declarative items (or a `render` closure) instead of appending directly to a passed-in `containerEl`; this internal restructuring is an unavoidable consequence of the API, confined to this one file, not a discretionary refactor.

## §Spec

### Declarative shape

`getSettingDefinitions()` returns a `SettingDefinitionItem[]` mirroring the current section structure: one top-level title item (a `SettingDefinitionRender`, per Preservation contract item 1's resolution — `.setHeading()` is only reachable through `render()`), one top-level language item, then one `SettingDefinitionGroup` per section (Connection, Context, Templates, UI) with `heading` set to the section's current `t()` heading string. Each row inside a group is a `SettingDefinitionRender` item carrying its own `name`/`desc` (from the same `t()` call the row uses today, or the resolution stated in Preservation contract items 6/9 for the two rows with no current call) and a `render(setting, group)` callback (full signature: `(setting: Setting, group: SettingGroup) => void | (() => void)`, per `obsidian.d.ts:6284` — `group` and the optional teardown return are unused by this migration) whose body is the row's existing `.addXxx(...)` chain, minus the now-declarative `.setName()`/`.setDesc()` (except items 6/9, which explicitly re-clear them — see those rows).

Conditional structure maps to `visible`:
- The three auth-method sub-sections/groups: `visible: () => this.plugin.settings.authMethod === '<method>'`.
- The CLI custom-model field: `visible: () => this.isCliModelCustom()` (extracted from the existing inline `isCustom` computation, unchanged logic).
- The shared model picker's two render modes (text vs. dropdown) and the Load/Reload button's loading state stay inside their `render` callback body exactly as they are today (session-only instance-field branching, not `visible`-predicate-driven — no behavior change).

### Re-render

Every one of the 4 current `this.display()` calls (language change, auth-method change, CLI-model dropdown change, model-list load success) becomes `this.update()`. `containerEl.addClass("excavelo-settings")` moves into `getSettingDefinitions()` (called on every render per the API's documented contract; `addClass` is idempotent).

### `display()` removal

Deleted in the same change — Obsidian bypasses it once `getSettingDefinitions()` returns non-empty, so this is not a separate behavioral step.

### Characterization safety net (ordering)

Per the brownfield spine's step 4, the safety net is authored and committed **before** the migration touches `settings-tab.ts`:

1. `scripts/probe-settings-tab.mjs` (new, following the `probe-git-log.mjs` convention: esbuild-bundle with a hand-rolled `obsidian` stub, `node:assert`, no test framework/new dependency) stubs `Setting` as a recording fake — each `.setName()`/`.setDesc()`/`.setHeading()`/`.addXxx()` call records its arguments/invocation and captures the registered `onChange`/click handler instead of touching a DOM.
2. Against **pre-migration** `display()`, for each combination of auth method (×3) × `cliModelCustom` (×2) × `modelLists[cacheKey]` present/absent (×2), the probe drives a fresh `ExcaveloSettingTab`, records the ordered list of rendered rows (name/desc/control-kind/whether `.setHeading()` was invoked), and drives every captured `onChange`/click handler to assert its effect on a fake `plugin.settings` object and on `Notice`/button-state stand-ins.
3. This snapshot is committed as the safety-net commit (a normal prod commit under this confirmed contract, per spine step 4 — no `PROD_RE` test exception applies to it).
4. After the migration, the same probe file (assertions unchanged) is re-run by walking `getSettingDefinitions()`'s returned tree, invoking each `SettingDefinitionRender.render()` with the same recording fake, and re-invoking the captured handlers — it must pass unchanged.
5. **Stated residual** — this probe emulates Obsidian's declarative-tree walk and DOM-construction calls; it does not run inside real Obsidian and cannot observe the actual settings-search index or real rendering. That gap is covered by the manual-QA acceptance criterion (§Why, success criterion 8), not by this probe.

### Invariants

- **I1** — no `render` callback or `onChange` handler reads or writes any `plugin.settings.*` path other than the one its current imperative code already reads/writes; no cross-field coupling is introduced by the restructuring.
- **I2** — `getSettingDefinitions()` itself never mutates `plugin.settings` or calls `saveSettings()`; all mutation happens inside `onChange`/`render`-internal handlers, exactly as today's `renderXxx` methods only mutate inside `.onChange()`.
- **I3** — `modelLists` and `cliModelCustom` are never read from or written to `plugin.settings` (see Preservation contract item 11).

- allowed-surface:
  - src/settings/settings-tab.ts
  - scripts/probe-settings-tab.mjs
- refactor-scope:
  - src/settings/settings-tab.ts — internal restructuring only (splitting `renderXxx` methods into declarative-item builders), required by the API itself, no behavior change beyond what §Spec states. No other file's logic changes.
