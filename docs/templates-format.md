# Template file format

Templates are markdown files in `<vault>/<templatesFolder>/*.md`. Default folder
is `excaVelo/templates`. The plugin auto-discovers every `.md` file in that
folder and parses it into a `Template` object.

## Anatomy

```markdown
---
name: meeting-minutes
description: Standard meeting minutes — participants, decisions, action items
icon: clipboard-list
hotkey: null
provider: null
output: new-file
output_filename: "{date}-{slug}"
---

# Instruction

You will receive raw meeting notes. Rewrite them as proper meeting minutes
using the structure below. Preserve the language of the raw memo. If a section
has no content in the source, write "(none)".

## Participants
...
```

## Frontmatter fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | Shown in chooser. Used as the template ID. Must be unique within the folder. |
| `description` | string | yes | One-line summary for the chooser. |
| `icon` | string | optional | Lucide icon name. Reserved for future UI use. |
| `hotkey` | string \| null | optional | Reserved. Hotkeys are still bound via Obsidian's settings, not the template. |
| `provider` | enum \| null | optional | Per-template provider override. Values: `claude-code-cli`, `anthropic-api`, `openai-compat`. `null` uses the global setting. |
| `output` | enum | optional | Default action highlighted in preview modal: `append`, `new-file`, `preview-first`. Default `preview-first`. |
| `output_folder` | string | optional | Default save path for "Save as new". Overridden by wiki config when wiki mode is on. |
| `output_filename` | string | optional | Filename pattern. Placeholders: `{date}`, `{slug}`, `{template}`. Default `{date}-{slug}`. |

## Body

Everything after `# Instruction` (case-insensitive) is treated as the LLM
instruction. The plugin strips the heading itself; the rest is passed verbatim.

Recommendations for instructions:

- Begin with one sentence describing what the input is.
- Define the output structure explicitly (sections in order).
- Say what to do when a section has no source content (e.g. "write (none)").
- State language behavior — usually "preserve the language of the raw memo".
- Avoid baking the user's context into the instruction. Context is injected
  separately by the plugin from default/per-note callout.

## Authoring tips

- Test the template by transforming a known memo and reading the output.
- Iterate the instruction in small steps — LLMs are sensitive to phrasing.
- Use Markdown headings in the instruction itself; the LLM mirrors them.
- Keep instructions under ~300 lines. Beyond that, output drifts.

## Starter templates

The plugin ships five starter templates:

- `meeting-minutes.md`
- `1on1.md`
- `daily-memo.md`
- `decision-record.md`
- `brainstorm.md`

Their source-of-truth markdown lives in the repo's `starter-templates/` folder
(easy to browse and edit on GitHub), but the runtime copy is the inlined TS
module at `src/core/starter-templates.ts` — Obsidian only loads `main.js` /
`manifest.json` / `styles.css`, so the markdown files themselves are not
present at the user's machine. When you update one, update both copies.

On first run, if `templatesFolder` is empty, `TemplateRegistry.ensureStarter()`
writes the inlined templates into the vault. Users can edit, delete, or
override afterwards; existing files are never overwritten. A "Restore starter
templates" button in Settings recreates any missing entries on demand.
