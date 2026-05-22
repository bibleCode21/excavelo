# Changelog

All notable changes to excaVelo are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-05-22

First public release. Submitted to the Obsidian Community Plugins catalog.

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
