# Changelog

All notable changes to ExcaVelo are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **`[!git]` reported the wrong half of your work.** Commits were sourced from branch tips with the default branch's history subtracted, which selects only what has *not* been merged: a branch that landed contributed nothing at all (its section vanished), while unfinished branches filled the work log. Work is now sourced from what actually landed on the default branch, so a work log records what shipped. Merge, squash, and rebase workflows all work without configuration — each entry on the default branch's first-parent history is one landing, and a merge expands to the commits it brought in.

### Changed

- **`[!git]` dates are landing dates.** A section is dated by the day its work reached the default branch, not the day it was written, and `since:`/`until:` bound the same date — so a report for a window no longer contains entries dated outside it. Work authored in June and merged in July is reported under July. The per-commit lines still show author dates.
- **`[!git] <path>` with no branch selection** now reports the default branch instead of whichever branch happened to be checked out.
- Work that has not landed is labelled `--- not yet on <base>` and is never written up as shipped. `work-log` omits it; `work-report` feeds it to "In progress / carried over".
- Known limitations, in squash- and rebase-merge repositories only. Landings carry no branch name there, so: pasted branch names cannot narrow the log; a branch's commits may show as unlanded after their content shipped squashed (the templates resolve this — a landed section wins); and because nothing narrows the log, a window holding more than 50 landings drops the oldest without regard to what was selected, so a busy repository can omit work you asked for — narrow the window with `since:` if you work that way. See `docs/specs/git-log-master-source.md`.

## [1.4.2] - 2026-07-15

### Fixed

- **`minAppVersion` raised to 1.13.0**, which unblocks the community-plugin review. 1.4.1 adopted `ButtonComponent.setDestructive()` on the "Update starter templates" button; that API is `@since 1.13.0` while the manifest still declared 1.5.0, so the review rejected the release with `obsidianmd/no-unsupported-api`. It was the only API in the plugin newer than the declared minimum. Existing installs on Obsidian below 1.13.0 keep running 1.4.1 — `versions.json` still maps every prior release to 1.5.0 — they simply stop being offered updates.

### Added

- **`eslint-plugin-obsidianmd`'s `no-unsupported-api` rule now runs in `pnpm lint`**, which is what CI and the release workflow gate on. This is the rule Obsidian's own review runs, and its absence is why 1.4.1 shipped: local lint was green and nothing checked API versions against the manifest. Verified both ways — with `minAppVersion: 1.5.0` restored, `pnpm lint` now fails on exactly the line the review flagged. It needs type information, so the parser gained `project: "./tsconfig.json"`.

### Notes

- Only that one rule of the plugin is enabled. Its `recommended` set reports 65 further findings in this codebase (chiefly the declarative settings API — `getSettingDefinitions` — and sentence-case UI text); adopting them is separate work, not a release fix.

## [1.4.1] - 2026-07-15

### Fixed

- Resolved findings from Obsidian's automated community-plugin review: `any`-typed casts replaced with proper type narrowing (`FileSystemAdapter`, `unknown`-scoped casts), settings-tab section headings now use `Setting().setHeading()` instead of raw `<h2>`/`<h3>` elements, and the preview modal's markdown renderer runs against a modal-scoped `Component` instead of the long-lived plugin instance (closes a real listener-lifecycle leak). No functional change.

## [1.4.0] - 2026-07-05

### Added

- **STT transcript input** (`[!stt]` callout). Link speech-to-text transcript files into a transform; the meeting templates recover details, figures, and decisions the memo omits. The memo stays the authoritative record — it wins on conflict, small talk is ignored, and garbled passages are marked ("(STT 손상 구간)"), never guessed.
- **Git history input** (`[!git]` callout, desktop only). Name local repositories (one path per line, several repos per callout, optional `since:`/`until:`) and their commit history (message + diffstat) feeds the transform. Branch names pasted into the memo (`branch-name  subject` lines from git output) are looked up in every listed repository and contribute exactly their own commits (default-branch history subtracted) — built for one-branch-per-issue workflows. A `branches:<glob>` token scans matching branches instead.
- **Model selection.** CLI path: alias dropdown (sonnet / opus / haiku / Claude Code default) plus custom id input. API paths: "Load model list" fetches the endpoint's catalog into a dropdown. Templates can pin a model via `model` frontmatter.
- **Plugin language setting** (auto / en / ko); auto follows Obsidian's app language. Template chooser shows `description_ko` frontmatter when the locale is Korean.
- **Four new starter templates**: `meeting` (cross-team, selective by design), `task-meeting` (internal, detail kept), `work-report` (narrative report from git history), `work-log` (dated 업무내역 changelog for non-developer readers). `meeting-minutes` is superseded by the meeting/task-meeting split.

### Changed

- **Preservation-first output contract.** The global OUTPUT RULES now enforce item-level completeness for the raw memo: every fact, name, number, date, and decision survives into the output, output length scales with input, and inference is quarantined to explicitly labeled sections. All starter templates were rebuilt around this contract (policy: `docs/prd.md`).
- **API providers call their HTTP endpoints via Obsidian `requestUrl`** instead of the Anthropic/OpenAI SDKs — bypasses CORS, behaves identically on mobile, and drops both SDK dependencies from the bundle. The Anthropic path keeps the cacheable system block and adds best-effort cost reporting.
- **Claude Code CLI runner hardened**: binary detection cascade (setting hint > PATH > native installer > npm prefixes incl. nvm/volta), Windows `.cmd` shim support with the prompt on stdin only, process-tree kill on timeout, and JSON recovery when diagnostics leak onto stdout.
- Default CLI timeout raised from 120s to 720s — long transcripts on opus routinely need minutes. Nested settings now deep-merge so old `data.json` files gain new fields safely.
- Default template is now `meeting`.
- pnpm pinned to 11.9.0 via corepack; `pnpm-workspace.yaml` allowlists esbuild's postinstall.

### Removed

- `@anthropic-ai/sdk` and `openai` dependencies.
- `meeting-minutes` starter template (superseded; existing copies in vaults are untouched).

## [1.3.3] - 2026-05-23

### Changed

- **Display name capitalized: `excaVelo` -> `ExcaVelo`** throughout user-visible surfaces — catalog name (`manifest.json`'s `name` field), READMEs, CHANGELOG header, command palette prefix, ribbon tooltip, status bar text, Notice messages, modal titles, and code comments / docs.
- The plugin id (`excavelo`), GitHub repo (`bibleCode21/excavelo`), and catalog URL (`https://community.obsidian.md/plugins/excavelo`) are unchanged — they stay lowercase to avoid breaking the install / settings keys of existing users.
- The default vault folder path (`excaVelo/templates`) is also unchanged for the same reason, so users upgrading from 1.0.0-1.3.2 see no change in where their templates live.

### Notes

- This is purely a brand-display change. Functional behavior is identical to 1.3.2.

## [1.3.2] - 2026-05-23

### Added

- **GitHub Actions release workflow** (`.github/workflows/release.yml`). On any push of a SemVer-shaped tag (e.g. `1.3.2`), the workflow checks out, installs deps via pnpm with a frozen lockfile, runs lint + build, attests build provenance for `main.js` / `manifest.json` / `styles.css` via `actions/attest-build-provenance@v2`, and creates a GitHub Release with the per-version section of CHANGELOG.md as the body and the three artifacts attached.
- This addresses the `Recommendation` raised in the community.obsidian.md review of 1.0.0 ("the `main.js` release asset does not have a GitHub artifact attestation"). Future releases ship with a cryptographically verifiable build-provenance attestation linking the artifact to this repo's source.

### Changed

- The release process no longer requires a local `pnpm build` + manual `gh release create`. Tagging is enough: `git tag X.Y.Z && git push origin X.Y.Z` triggers the workflow, which builds in a clean Ubuntu runner with Node 20 and publishes the release. Local builds still work for development and smoke testing.

### Fixed

- Both workflows (`ci.yml`, `release.yml`) no longer pass `version: 9` to `pnpm/action-setup@v4`. The action reads the pinned version from `package.json`'s `packageManager` field (`pnpm@9.12.0`); supplying both causes `ERR_PNPM_BAD_PM_VERSION` and aborts the run. This is what crashed the very first attempt at the release workflow.

### Notes

- 1.3.1 was tagged but its release workflow failed for the reason above; no GitHub Release object or catalog update ever shipped under that version. `versions.json` therefore lists 1.3.0 followed by 1.3.2, skipping 1.3.1.

## [1.3.0] - 2026-05-23

### Added

- **"Update starter templates" button** in Settings -> Templates. Overwrites the five bundled starter templates in your vault with the latest versions shipped in the plugin. This lets a plugin upgrade roll new frontmatter fields (such as the `new_note_*` family introduced in 1.1.0) onto an existing vault without manually deleting files. The existing "Restore" button keeps its conservative behavior (only fills in missing files).
- The new button is styled as a `setWarning` button (Obsidian's red action style) and the description states clearly that edits to the five starter files will be erased — there is no separate confirmation dialog.

### Notes

- Your own templates (any markdown file in the templates folder that is not one of the five starter filenames) are not touched by either button.
- Behind the scenes the new path uses `vault.modify` on existing files and `vault.create` on missing ones, both via the Obsidian API.

## [1.2.0] - 2026-05-23

### Added

- **Korean UI translation.** Commands, ribbon tooltip, status bar, every modal (Onboarding, Chooser, Preview), the entire settings tab, and all `Notice` messages now follow the Obsidian language setting. When Obsidian is in Korean, ExcaVelo's UI is in Korean; otherwise it falls back to English.
- New `src/i18n/` module with a tiny `t(key, vars)` helper. Locale is read from `window.localStorage.getItem("language")` (Obsidian's own UI-language store), with `navigator.language` as a fallback and `"en"` as the final default. Strings with `{placeholder}` slots are interpolated.
- Two dictionaries: `src/i18n/en.ts` and `src/i18n/ko.ts`, each with ~60 keys covering every user-visible string in the plugin.

### Changed

- **PreviewModal scroll behavior.** The modal element itself is now capped at `calc(100vh - 80px)` and laid out as a flex column. The response body scrolls within the modal; the title, "Save to" field, meta line, and action footer stay pinned via `flex-shrink: 0`. Long LLM responses no longer push the action buttons below the viewport.

### Notes

- The locale is captured at plugin load. Switching Obsidian's language at runtime requires toggling the plugin off and on (Settings -> Community plugins) for the new strings to take effect — same caveat as most plugins that ship their own translations.
- Starter-template bodies (`new_note_scaffold`, instruction body) and the on-disk `starter-templates/*.md` files remain in English. Users can localize their own templates by editing the markdown directly in their vault.

## [1.1.0] - 2026-05-23

### Added

- **New command: `ExcaVelo: New note from template`**. Pick a template and the plugin creates a fresh note with a pre-filled `[!context]` callout scaffold, so you only fill in the blanks before writing the memo body. Removes the need to write the callout syntax by hand.
- Each starter template now ships with three optional frontmatter fields for the new command:
  - `new_note_folder` — where to create the note (default: vault root).
  - `new_note_filename` — filename pattern with `{date}`, `{slug}`, `{template}` placeholders. `{slug}` falls back to `untitled` because the new note has no source slug yet — rename it after creation.
  - `new_note_scaffold` — body of the new note (typically a `[!context]` callout). `{date}` is substituted with today's ISO date.
- Frontmatter parser now supports YAML literal block scalars (`key: |` followed by indented body) so multi-line scaffolds remain readable in the template markdown.

### Changed

- All five starter templates now include `new_note_filename` and `new_note_scaffold`. Existing user-edited templates without these fields keep working — the new command falls back to a generic `[!context]` callout and a vault-root filename.
- README + Korean README updated with the new command in Quick start and the "How the plugin reads your note" section. CLAUDE.md and docs/templates-format.md reflect the new frontmatter fields.

## [1.0.0] - 2026-05-22

First public release. Published in the Obsidian Community Plugins catalog at https://community.obsidian.md/plugins/excavelo.

### Added

- Transform raw memos into structured notes using Claude.
- Five starter templates: `meeting-minutes`, `1on1`, `daily-memo`, `decision-record`, `brainstorm`. Copied into the vault on first run; never overwrite existing files.
- Three authentication methods, user picks at setup (auto-detect helps):
  - **Claude Code CLI** (primary) — spawns your installed `claude` CLI as a subprocess. Auth lives in Claude Code itself, so the plugin never sees a key. Works with personal Claude Pro accounts and team-shared Claude Max accounts. Desktop only.
  - **Anthropic API key** — paste a key from `console.anthropic.com`. Pay-per-token. Works on mobile.
  - **OpenAI-compatible endpoint** — OpenAI, Ollama, LM Studio, Groq, Together, OpenRouter, vLLM, Fireworks, Mistral, etc.
- Preview modal with six commit actions. Each has a hover tooltip explaining intent:
  - **Append to current** — adds the response below the current note; raw memo stays in place.
  - **Save as new** — writes the response to a separate file; current note untouched.
  - **Replace** — overwrites the current note with the response. `Cmd+Z` (or `Ctrl+Z`) undoes.
  - **Copy** — copies to the system clipboard; no files change.
  - **Regenerate** — re-runs the transform for a new variation (LLM output is non-deterministic).
  - **Discard** — closes without saving.
- Per-note context via `[!context]` callout — extracted and prepended to the prompt without polluting the raw memo.
- Default context setting — long-lived user / team / project info, reused across every transform.
- Wiki integration (Level 1) — if the vault has `excavelo.json` at root with `wikiMode: true`, output paths and frontmatter presets auto-fill from the wiki config.
- Mobile support — Claude Code CLI is desktop-only, so on mobile the plugin transparently falls back to the Anthropic API key path. A one-time Notice informs the user.
- Anthropic prompt caching — the always-on `USER CONTEXT` block is sent as a cacheable system block, cutting input-token cost when the same default context is reused.
- Ribbon icon, editor context menu entry, command palette commands (`Transform note...`, `Transform with default template`, `Open templates folder`), and a status bar entry that opens the plugin's settings tab on click.
- Settings: per-method configuration (binary path / API key / base URL / model / timeout), default context, templates folder, default template, "Test connection" button per method, "Restore starter templates" button.
- Korean README (`README.ko.md`).

### Privacy

- API keys are stored locally in `data.json` under the plugin folder, never sent anywhere except to the provider the user configured.
- Claude Code CLI path stores no credentials at all — auth is handled entirely by Claude Code.
- No telemetry, no analytics, no remote logging.
- Network calls are made only when the user triggers a transform.

### Notes

- Anthropic does not document using Claude Code as a backend for another tool. ExcaVelo spawning the user's own logged-in `claude` CLI is mechanically identical to running it manually, but users should be aware of this grey area. The Anthropic API key path is available as an alternative.
- The plugin is desktop + mobile (`isDesktopOnly: false` in `manifest.json`), but the Claude Code CLI path is desktop-only.
