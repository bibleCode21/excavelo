# excaVelo

> 한국어 README: [README.ko.md](README.ko.md)

Transform raw memos into structured notes using Claude. Works with your existing Claude Code login (Pro/Max) or with an Anthropic API key.

## Why

You scribble fragmented notes during a meeting or a quick thought. You want them
turned into proper meeting minutes, a 1:1 summary, a decision record, or your
own template — without leaving Obsidian and without copy-pasting into a chat.

excaVelo takes:

- your pre-set context (who you are, what team, what project),
- any per-note context you added,
- the raw memo body,
- a template you choose,

and produces a clean, structured note via Claude. The raw memo is preserved.

## Quick start

1. Install excaVelo from Obsidian Community Plugins (or load it as an unpacked plugin during development).
2. Choose one of:
   - **Claude Code CLI (recommended)** — if you already use Claude Code on the desktop with a Pro/Max subscription, the plugin auto-detects and uses it. No API key needed.
   - **Anthropic API key** — paste a key from `console.anthropic.com`. Pay-per-token. Works on mobile.
   - **OpenAI-compatible endpoint** — point at OpenAI, Ollama, LM Studio, Groq, Together, OpenRouter, etc.
3. Fill in **Default context** in settings — one paragraph about who you are and what you work on.
4. Open any note, type a raw memo, and run **excaVelo: Transform note...** from the command palette (or click the wand icon in the ribbon).
5. Pick a template. Review the preview. Save as new file, append below, or copy.

## Adding per-note context

Drop a `[!context]` callout anywhere in the note. The plugin extracts it and adds
it to the LLM prompt; the rest of the note becomes the raw memo.

```markdown
> [!context]
> Today is a 1:1 with Park, infra team senior.
> Topic: migration risk assessment.

- migration phases — risk
- A: blue-green, B: incremental
- Park prefers B (simpler rollback)
- need a decision by Tuesday
```

## Templates

Templates are plain markdown files under `excaVelo/templates/` in your vault.
Edit them, add new ones, share them. The format is documented in
[`docs/templates-format.md`](docs/templates-format.md). Five starter templates
are copied in on first run:

- `meeting-minutes` — participants, discussion, decisions, action items
- `1on1` — themes, decisions, watch items, tone signal
- `daily-memo` — highlights, grouped notes, actions, open questions
- `decision-record` — ADR-style record
- `brainstorm` — clustered themes, strong candidates, next steps

## Authentication paths

### Claude Code CLI (recommended for Claude Pro/Max users)

The plugin spawns your installed `claude` CLI as a subprocess. Auth lives in
Claude Code (`claude login`), so the plugin never sees a key. Works with personal
Claude Pro accounts and with team-shared Claude Max accounts.

**Requires**: Claude Code installed and logged in. Desktop only — on mobile,
excaVelo transparently falls back to the Anthropic API key path (a one-time
notice tells you).

**A note on Anthropic terms**: spawning your own logged-in `claude` CLI is
mechanically the same as running it yourself in a terminal. excaVelo does not
redistribute any Anthropic licence and stores no Anthropic credentials. Using
Claude Code as a backend for another tool is not a documented use case in
Anthropic's product docs — use the CLI path knowing that, or pick the API key
path instead.

### Anthropic API key

Standard pattern. Get a key at `console.anthropic.com`, paste into settings.
Pay-per-token billing — separate from any Claude.ai subscription. Works on
mobile and desktop.

### OpenAI-compatible endpoint

For OpenAI itself, or any local / hosted server that speaks the OpenAI Chat
Completions shape (Ollama, LM Studio, Groq, Together, OpenRouter, vLLM,
Fireworks, Mistral, ...).

## Privacy

- Your API key (when used) is stored locally in `data.json` inside your Obsidian
  plugin folder. It is never sent anywhere except to the provider you configured.
- When using Claude Code CLI, the plugin only spawns a local subprocess. No keys
  or tokens are stored by the plugin.
- No telemetry, no analytics, no remote logging.
- Network requests are made **only** when you trigger a transform — never on
  install, settings open, or vault scan.

## Wiki integration

If your vault includes an `excavelo.json` at root, the plugin enables smart
defaults — output paths and frontmatter that match the structure of Karpathy-style
LLM Wiki vaults (`raw/`, `wiki/sources/`). See
[`docs/architecture.md`](docs/architecture.md) for the config schema.

## Development

```
pnpm install
pnpm dev     # esbuild watch
pnpm build   # production build
```

Uses pnpm (declared in `packageManager`). If you don't have it: `npm i -g pnpm` or `corepack enable`.

Symlink (or copy) the build output (`main.js`, `manifest.json`, `styles.css`)
into a test vault's `.obsidian/plugins/excavelo/` to try it.

Architecture overview: [`docs/architecture.md`](docs/architecture.md).
Provider implementation notes: [`docs/adapters.md`](docs/adapters.md).
Template format: [`docs/templates-format.md`](docs/templates-format.md).
Developer spec: [`CLAUDE.md`](CLAUDE.md).

## License

MIT. See [`LICENSE`](LICENSE).
