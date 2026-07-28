# Architecture

## Module responsibilities

| Module | Responsibility |
|---|---|
| `src/main.ts` | Plugin lifecycle, command/ribbon/status-bar registration, vault event wiring, provider resolution (incl. mobile CLI-to-API fallback). Thin orchestrator only. |
| `src/types.ts` | All shared TypeScript types. Single source of truth for cross-module shapes. |
| `src/i18n/` | UI strings — `en.ts` source of truth, `ko.ts` overlay, `index.ts` locale resolution. Locale = plugin language setting, falling back to Obsidian's app language. |
| `src/settings/settings.ts` | `DEFAULT_SETTINGS` constant. Schema migrations live here when fields change. |
| `src/settings/settings-tab.ts` | Obsidian `PluginSettingTab` — UI only, no logic. |
| `src/ui/chooser-modal.ts` | `FuzzySuggestModal` listing templates; default highlighted; `description_ko` shown for Korean locale. |
| `src/ui/preview-modal.ts` | Renders the LLM response, exposes commit actions. Per-template `output` decides the highlighted button. |
| `src/ui/onboarding-modal.ts` | First-run setup wizard. Calls into the CLI detector. |
| `src/llm/llm.ts` | `LlmProvider` interface + `LlmError`. |
| `src/llm/claude-code-cli.ts` | Spawns `claude -p`. Desktop only. Refuses to instantiate on mobile. |
| `src/llm/anthropic.ts` | Anthropic Messages API over Obsidian `requestUrl` (no SDK — see `adapters.md`). Cacheable system block; cost table lives here. |
| `src/llm/openai-compat.ts` | Generic OpenAI-shape HTTP over `requestUrl`. Covers OpenAI, Ollama, Groq, Together, LM Studio, etc. |
| `src/core/templates.ts` | Scans `<vault>/<templatesFolder>/*.md`, parses frontmatter, returns `Template[]`. `ensureStarter()` copies the bundled starter templates into the vault on first run when the folder is empty; `forceWriteStarter()` backs the "Update starter templates" button. |
| `src/core/starter-templates.ts` | The bundled starter templates inlined as a TS module so they ship inside `main.js`. Auto-generated from `starter-templates/*.md` by `scripts/generate-starter-templates.mjs` (prebuild hook) — edit the markdown, never this file. |
| `src/core/context.ts` | Extracts `[!context]`, `[!stt]`, and `[!git]` callouts from the note body; returns `{ perNoteContext, rawBody, sttLinks, gitSpecs }`. |
| `src/core/git-log.ts` | Parses `[!git]` specs and runs `git log` (message + diffstat) on named local repos. Sources work from what landed on each repo's default branch — one section per first-parent landing, merges expanded to the commits they brought in — so shipped work is what gets reported. Selected branches are confirmed against the base by three checks (a landing naming the branch, base-unique subjects resolving to one landing, ancestry); a branch none of them confirms is reported nowhere, and work that never landed is absent entirely. Desktop only, lazy node requires. Contracts: `docs/specs/git-log-master-source.md` (landing traversal), `docs/specs/git-log-landed-confirmation.md` (the predicate). |
| `src/core/prompt.ts` | Assembles a `PromptInput { system, user }`. `system` carries the cacheable USER CONTEXT block; `user` carries note-specific context, raw memo, transcript/git sections, task, and the OUTPUT RULES (preservation-first contract plus transcript/git rules when those sources are attached). |
| `src/core/transform.ts` | Orchestrator: pulls context, loads `[!stt]` transcripts and `[!git]` logs, builds prompt, calls provider, returns response. UI-agnostic. |
| `src/wiki/detect.ts` | Reads vault-root `excavelo.json`. Returns `null` when not in wiki mode. |
| `src/wiki/mapping.ts` | Resolves save path + filename + frontmatter preset for a given template under the active wiki config. |

## Wiki config (`excavelo.json`)

Sits at vault root. Presence + `wikiMode: true` flips the plugin into wiki mode.

```json
{
  "wikiMode": true,
  "rawRoot": "raw",
  "wikiRoot": "wiki",
  "sourcesPath": "wiki/sources",
  "contextFromClaudeMd": false,
  "templateMapping": {
    "meeting": {
      "savePath": "wiki/sources",
      "filenamePattern": "{date}-{slug}",
      "frontmatterPreset": {
        "type": "source",
        "source_type": "meeting"
      }
    }
  }
}
```

Fields:

- `wikiMode` (bool, required) — anything else falsy disables wiki integration.
- `rawRoot`, `wikiRoot`, `sourcesPath` (strings, optional) — defaults `raw`, `wiki`, `wiki/sources`.
- `contextFromClaudeMd` (bool, optional) — if `true`, plugin prepends a short blurb from the vault's `CLAUDE.md` to the LLM context. Default `false`.
- `templateMapping[templateName]` — per-template overrides for output destination and frontmatter.

Filename placeholders in `filenamePattern`:

- `{date}` — today, `YYYY-MM-DD`.
- `{slug}` — derived from active note basename (lowercased, spaces → `-`).
- `{template}` — template name.

## Settings storage

Settings live in `<vault>/.obsidian/plugins/excavelo/data.json`. That file is in `.gitignore`
because during development it can contain the developer's own API key.

## Error surface

Errors from the LLM layer throw `LlmError` (in `src/llm/llm.ts`). The runner catches and
emits a `Notice` so the user sees a toast; the original error is re-thrown for `main.ts`
to log to console. No silent failures.

## Why a separate `core/transform.ts` orchestrator

The runner is UI-agnostic. The same orchestrator can be reused by:

- A hotkey-driven "transform with default" command.
- A future "transform-on-save" feature.
- A possible CLI / scripting interface.

Keeping orchestration out of `main.ts` keeps `main.ts` focused on Obsidian wiring.
