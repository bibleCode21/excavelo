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
| `description_ko` | string | optional | Korean chooser description, shown when the UI locale is Korean. |
| `icon` | string | optional | Lucide icon name. Reserved for future UI use. |
| `hotkey` | string \| null | optional | Reserved. Hotkeys are still bound via Obsidian's settings, not the template. |
| `provider` | enum \| null | optional | Per-template provider override. Values: `claude-code-cli`, `anthropic-api`, `openai-compat`. `null` uses the global setting. |
| `model` | string \| null | optional | Per-template model override, passed to the provider (`sonnet`, `opus`, a full model id...). `null` uses the provider's own model setting. |
| `output` | enum | optional | Default action highlighted in preview modal: `append`, `new-file`, `preview-first`. Default `preview-first`. |
| `output_folder` | string | optional | Default save path for "Save as new". Overridden by wiki config when wiki mode is on. |
| `output_filename` | string | optional | Filename pattern. Placeholders: `{date}`, `{slug}`, `{template}`. Default `{date}-{slug}`. |
| `new_note_folder` | string | optional | Folder used by the `New note from template` command. Default: vault root. |
| `new_note_filename` | string | optional | Filename pattern for `New note from template`. Same placeholders as `output_filename`. `{slug}` falls back to `untitled` because the new note has no source slug yet — rename it after creation. |
| `new_note_scaffold` | block string (YAML `\|`) | optional | Body of the new note. `{date}` is substituted. Typical use: a `[!context]` callout with empty fields for the user to fill, plus an HTML comment marking where the memo body starts. Falls back to a generic `[!context]` callout when absent. |

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

## STT transcripts as input

A memo may attach speech-to-text transcript files via a `[!stt]` callout:

```markdown
> [!stt] [[2026-07-04 meeting recording]]
```

The plugin reads every `[[link]]` in `[!stt]` callouts and passes the file
contents to the LLM as a `MEETING TRANSCRIPT (STT)` section after the raw
memo. The prompt builder adds transcript rules automatically: the memo wins
on conflict, small talk is ignored, and unintelligible passages are marked
as STT-damaged instead of guessed. Template instructions do not need to
restate any of this — they can simply assume a transcript may be present.

## Git history as input

A memo may attach commit history from local repositories via a `[!git]`
callout (desktop only — spawns the git binary):

```markdown
> [!git] C:/git/repo-a
> C:/git/repo-b
> [!git] D:/git/excavelo since:2026-07-01 until:2026-07-05
```

One spec per line (several lines = several repositories): a repo path
(spaces allowed), then optional `since:` / `until:` / `branches:` — dates
are ISO, `today`, or `7d`. Per commit the LLM sees date, author, subject,
body, and a diffstat (no full diffs). Prompt rules tell the model to treat
the log as ground truth and to group work by intent, not commit-by-commit.
`work-report.md` is built for this input.

Work is sourced from the repository's **default branch**, because that is
where work counts as done. Each entry on its first-parent history is one
*landing* and gets a section:

```
--- landed <YYYY-MM-DD> branch: <name>   a landing whose branch is known, with its commits
--- landed <YYYY-MM-DD> merge: <subject> a merge whose subject names no branch
--- landed <YYYY-MM-DD> direct           a single commit: direct, squashed, or rebased
--- confirmed landed on <base> branch: <name>
                                         a selected branch proven to have reached the
                                         base, listed as commit subjects — or, when it
                                         carries no lines at all, a branch whose commits
                                         appear among the `--- landed` sections instead
```

The date on a landing header is the day the work reached the default branch,
not the day it was written, and `since:`/`until:` bound that same date. Merge,
squash, and rebase workflows all work without configuration: a merge has two
or more parents and expands; anything else *is* its own landing.

**Nothing that has not reached the default branch appears in the log.** Work
sitting on an unlanded branch is not reported at all — not as pending, not as
unverified. The log is the shipped record and only that.

Branch selection is automatic: when the memo body contains branch names —
typically lines pasted straight from git, `branch-name  subject` — the
landings carrying those names are the ones emitted. Only a merge landing
carries a branch name of its own, so in squash and rebase repositories the
selected branches are instead **confirmed** against the base by three checks,
tried in order: a landing whose message names the branch (which needs no ref,
so a branch deleted after merging still counts), every base-unique commit
subject resolving to exactly one landing, or plain ancestry. A branch none of
them confirms is reported nowhere — a guess about what shipped is worse than
silence. A nameless landing is never dropped for lacking a name, but under a
selection it is bounded by the window (7 days by default), so pasting a branch
name no longer dumps the base's whole history alongside it.

Named landings keep taking no default window: an explicit selection is not
silently bounded to a week, and `since:`/`until:` still bound every kind when
the spec sets them. A repository where no pasted name matches keeps the plain
no-selection behavior, 7-day window included. `branches:<glob>` (e.g.
`branches:feature/2026/*`, `*` crosses `/`) selects the same way against a
glob and is confirmed by the same three checks. Only local state is read —
`git fetch` first if the branches live on a remote.

When the memo carries a work list — pasted branch lines, issue titles, or
ticket ids — prompt rules make it a pure filter: an entry with no matching
commits produces no output (never a fabricated one), a ticket id shared
between an issue and a branch name is the strongest match signal, and a
pasted branch name selects the landing that carries it.

## Starter templates

The plugin ships eight starter templates:

- `meeting.md` — cross-team/external meeting; purpose, key points by topic,
  confirmed decisions, implications, action items. Deliberately selective
  (an explicit override of the preservation rule, stated in its instruction);
  no speaker attribution; participants from the memo only
- `task-meeting.md` — internal working-level meeting; key points by topic
  with technical detail kept, decisions, open questions, implications. Same
  no-attribution rules
- `work-report.md` — work report / release notes from `[!git]` commit history
  plus memo; grouped by intent, outcomes first
- `work-log.md` — dated work history (업무내역) from `[!git]` commits: date
  blocks, module blocks, `[수정/추가] [scope]` one-line entries for
  non-developer readers
- `1on1.md`
- `daily-memo.md`
- `decision-record.md`
- `brainstorm.md`

Their source-of-truth markdown lives in the repo's `starter-templates/` folder
(easy to browse and edit on GitHub), but the runtime copy is the inlined TS
module at `src/core/starter-templates.ts` — Obsidian only loads `main.js` /
`manifest.json` / `styles.css`, so the markdown files themselves are not
present at the user's machine. The module is auto-generated from the markdown
by `scripts/generate-starter-templates.mjs` (a prebuild/predev hook): edit the
markdown, never the module.

On first run, if `templatesFolder` is empty, `TemplateRegistry.ensureStarter()`
writes the inlined templates into the vault. Users can edit, delete, or
override afterwards; existing files are never overwritten. A "Restore starter
templates" button in Settings recreates any missing entries on demand, and
"Update starter templates" overwrites the starter files with the plugin's
latest versions.
