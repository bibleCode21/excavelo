# Changelog

All notable changes to excaVelo are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-05-23

### Added

- **GitHub Actions release workflow** (`.github/workflows/release.yml`). On any push of a SemVer-shaped tag (e.g. `1.3.1`), the workflow checks out, installs deps via pnpm with a frozen lockfile, runs lint + build, attests build provenance for `main.js` / `manifest.json` / `styles.css` via `actions/attest-build-provenance@v2`, and creates a GitHub Release with the per-version section of CHANGELOG.md as the body and the three artifacts attached.
- This addresses the `Recommendation` raised in the community.obsidian.md review of 1.0.0 ("the `main.js` release asset does not have a GitHub artifact attestation"). Future releases ship with a cryptographically verifiable build-provenance attestation linking the artifact to this repo's source.

### Changed

- The release process no longer requires a local `pnpm build` + manual `gh release create`. Tagging is enough: `git tag X.Y.Z && git push origin X.Y.Z` triggers the workflow, which builds in a clean Ubuntu runner with Node 20 and publishes the release. Local builds still work for development and smoke testing.

## [1.3.0] - 2026-05-23

### Added

- **"Update starter templates" button** in Settings -> Templates. Overwrites the five bundled starter templates in your vault with the latest versions shipped in the plugin. This lets a plugin upgrade roll new frontmatter fields (such as the `new_note_*` family introduced in 1.1.0) onto an existing vault without manually deleting files. The existing "Restore" button keeps its conservative behavior (only fills in missing files).
- The new button is styled as a `setWarning` button (Obsidian's red action style) and the description states clearly that edits to the five starter files will be erased — there is no separate confirmation dialog.

### Notes

- Your own templates (any markdown file in the templates folder that is not one of the five starter filenames) are not touched by either button.
- Behind the scenes the new path uses `vault.modify` on existing files and `vault.create` on missing ones, both via the Obsidian API.

## [1.2.0] - 2026-05-23

### Added

- **Korean UI translation.** Commands, ribbon tooltip, status bar, every modal (Onboarding, Chooser, Preview), the entire settings tab, and all `Notice` messages now follow the Obsidian language setting. When Obsidian is in Korean, excaVelo's UI is in Korean; otherwise it falls back to English.
- New `src/i18n/` module with a tiny `t(key, vars)` helper. Locale is read from `window.localStorage.getItem("language")` (Obsidian's own UI-language store), with `navigator.language` as a fallback and `"en"` as the final default. Strings with `{placeholder}` slots are interpolated.
- Two dictionaries: `src/i18n/en.ts` and `src/i18n/ko.ts`, each with ~60 keys covering every user-visible string in the plugin.

### Changed

- **PreviewModal scroll behavior.** The modal element itself is now capped at `calc(100vh - 80px)` and laid out as a flex column. The response body scrolls within the modal; the title, "Save to" field, meta line, and action footer stay pinned via `flex-shrink: 0`. Long LLM responses no longer push the action buttons below the viewport.

### Notes

- The locale is captured at plugin load. Switching Obsidian's language at runtime requires toggling the plugin off and on (Settings -> Community plugins) for the new strings to take effect — same caveat as most plugins that ship their own translations.
- Starter-template bodies (`new_note_scaffold`, instruction body) and the on-disk `starter-templates/*.md` files remain in English. Users can localize their own templates by editing the markdown directly in their vault.

## [1.1.0] - 2026-05-23

### Added

- **New command: `excaVelo: New note from template`**. Pick a template and the plugin creates a fresh note with a pre-filled `[!context]` callout scaffold, so you only fill in the blanks before writing the memo body. Removes the need to write the callout syntax by hand.
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

- Anthropic does not document using Claude Code as a backend for another tool. excaVelo spawning the user's own logged-in `claude` CLI is mechanically identical to running it manually, but users should be aware of this grey area. The Anthropic API key path is available as an alternative.
- The plugin is desktop + mobile (`isDesktopOnly: false` in `manifest.json`), but the Claude Code CLI path is desktop-only.
