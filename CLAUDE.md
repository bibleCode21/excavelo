# excaVelo — Developer Spec

You are a contributor (or AI agent) working on **excaVelo**, an Obsidian community
plugin that transforms raw memo notes into structured outputs using Claude.

This file is the **index** to the spec. Keep it short. Details live in `docs/`.

---

## 1. The product in one sentence

A user opens any note, scribbles fragmented memo content, and triggers a transform.
The plugin assembles `(default context + per-note callout context + raw memo + chosen template instruction)`,
calls an LLM, and shows a preview modal where the user accepts the output as a new file or appends it.

Raw memo is **never overwritten by default**. The user explicitly chooses Replace if they want.

---

## 2. Hard rules

1. **No emojis** anywhere — output, UI, code comments. (Causes Unicode surrogate-pair issues at scale, and Obsidian guidelines prefer clean output.)
2. **No external network calls without an explicit user action.** LLM calls fire only on transform trigger.
3. **No telemetry, no analytics, no remote logging.**
4. **Raw memo is preserved** — the default output path is "save as new file" or "append below". Replace must be an explicit click, never default.
5. **Mobile-safe code paths** — the Claude Code CLI provider must check `Platform.isMobile` and refuse cleanly; the plugin as a whole works on mobile via the API-key path.
6. **Never commit `data.json`** — `.gitignore` excludes it. It holds the user's API key during development.

---

## 3. Authentication model

Three paths, user picks at setup (auto-detect helps):

| Method | When | How |
|---|---|---|
| **Claude Code CLI** (primary) | User has Claude Code installed and logged in | Plugin spawns `claude -p --output-format json` (prompt via stdin) and parses the JSON response. **No API key needed** — Claude Code handles its own OAuth. Desktop only. |
| **Anthropic API key** (fallback) | User pasted a key from console.anthropic.com | Plugin calls Anthropic Messages API via SDK. Works on mobile. |
| **OpenAI-compatible** (alternative) | User wants OpenAI / Ollama / Groq / LM Studio / etc. | Plugin calls `${baseUrl}/chat/completions`. Single code path covers all providers that expose the OpenAI shape. |

The team this plugin was designed for shares a **single Claude Max** subscription via
OAuth, so the CLI path is **non-negotiable** for the v1 launch. See `docs/adapters.md`.

On mobile, `providerFor()` transparently swaps an unwanted `claude-code-cli`
request for the Anthropic API path (with a one-time Notice) — the CLI is
desktop-only by construction.

---

## 4. Repository layout

```
excaVelo/
├── manifest.json              plugin metadata for Obsidian
├── package.json
├── tsconfig.json
├── esbuild.config.mjs
├── versions.json
├── styles.css
├── README.md                  user-facing (catalog uses this)
├── LICENSE                    MIT
├── CLAUDE.md                  this file — developer spec index
├── docs/                      details that don't belong in CLAUDE.md
│   ├── architecture.md
│   ├── adapters.md
│   └── templates-format.md
├── src/
│   ├── main.ts                Plugin entry — commands, ribbon, status bar, events
│   ├── types.ts               shared TypeScript types
│   ├── settings/
│   ├── ui/
│   ├── llm/                   one file per provider; all implement LlmProvider
│   ├── core/                  template scan, context extraction, prompt build, transform orchestrator;
│   │                          `starter-templates.ts` inlines the 5 starter templates as a TS module so
│   │                          they ship in the plugin bundle
│   └── wiki/                  optional wiki-vault integration (Level 1)
└── starter-templates/         source-of-truth markdown copies (read for GitHub review);
                               the runtime copy is the inlined module in src/core/starter-templates.ts
```

---

## 5. The data flow (one transform)

```
[active note in editor]
         |
         v
extractContext()        --> { perNoteContext, rawBody }
         |
         v
TemplateRegistry        --> Template (instruction + frontmatter)
         |
         v
buildPrompt()           --> PromptInput { system, user }
                            (system = cacheable USER CONTEXT;
                             user = note-context + raw memo + task + output rules)
         |
         v
resolveProvider()       --> LlmProvider (CLI / Anthropic / OpenAI-compat)
         |
         v
provider.generate()     --> LlmResponse { text, tokens?, cost? }
         |
         v
resolveWikiOutput()     --> { savePath, filename, frontmatterPreset? }
         |
         v
PreviewModal            --> user picks Append / Save as new / Replace / Copy / Regenerate / Discard
```

---

## 6. Wiki integration (Level 1)

When the active vault has an `excavelo.json` at root with `wikiMode: true`, the
plugin enables smart defaults:

- Output modal pre-fills `wiki/sources/{date}-{slug}.md` (or the path mapped to the chosen template).
- Frontmatter preset from `templateMapping[name].frontmatterPreset` is merged into the output.
- The plugin does **not** automatically run wiki `ingest` — that's the wiki's own Claude Code workflow.

Schema for `excavelo.json` → `docs/architecture.md` section "Wiki config".

---

## 7. UI surfaces

| Surface | What |
|---|---|
| Command palette | `excaVelo: Transform note...`, `excaVelo: Transform with default template`, `excaVelo: Open templates folder` |
| Ribbon icon | One icon → opens chooser |
| Hotkey | None bound by default; user assigns via Obsidian's standard hotkey settings |
| Editor context menu | "excaVelo: Transform note" |
| Status bar | "excaVelo: ready" / "excaVelo: thinking..." — click opens this plugin's settings tab |
| Selection support | If a selection is active, only the selection becomes the raw memo |

---

## 8. Out of scope (today)

- Streaming output (modal renders the full response when ready).
- Multi-template "apply both" (chooser is single-pick).
- Auto-run wiki ingest after save.
- A vector store for context retrieval — context is explicit, not retrieved.

Prompt caching is **in scope** — Anthropic API path attaches an ephemeral
`cache_control` to the USER CONTEXT block, and Claude Code CLI manages caching
itself. Tuning beyond the default ephemeral breakpoint stays deferred.

---

## 9. Submission to Obsidian Community Plugins

Pre-submission checklist lives in `README.md` (user-facing). Developer checklist:

- [ ] `manifest.json` matches `package.json` version
- [ ] `versions.json` lists the version with its minAppVersion
- [ ] `pnpm build` succeeds with no TypeScript errors
- [ ] Release artifacts on GitHub: `main.js`, `manifest.json`, `styles.css`
- [ ] `obsidian-releases` PR with the catalog entry
- [ ] Manual QA pass on macOS + Windows + iOS + Android (CLI path desktop-only)

## 10. Tooling

- **Package manager**: pnpm. Declared via `packageManager` field in `package.json`
  so `corepack enable` works for contributors. `.npmrc` sets `auto-install-peers=true`.
- **Lockfile**: `pnpm-lock.yaml`. Commit it. Do not also commit `package-lock.json`.
