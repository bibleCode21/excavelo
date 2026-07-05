# LLM adapters

All adapters implement `LlmProvider` from `src/llm/llm.ts`:

```ts
interface LlmProvider {
  readonly id: string;
  generate(input: PromptInput, opts?: GenerateOptions): Promise<LlmResponse>;
  ping(): Promise<{ ok: boolean; detail?: string }>;
}
```

`generate` is the workhorse; `ping` is for "Test connection" in settings.
`PromptInput` is a `{ system, user }` pair: `system` carries the cacheable
always-on USER CONTEXT block (may be empty), `user` carries everything that
varies per transform. Each adapter maps the pair onto its wire format.

## Claude Code CLI (`claude-code-cli.ts`) — primary

The team's expected path. Plugin spawns the user's already-authenticated
Claude Code, so no API key is handled by the plugin at all.

### Spawn shape

```
claude
  -p
  --output-format json
  --permission-mode <default|bypassPermissions>
  [--model <model-id>]
```

The prompt is written to stdin, not passed as an argument: it is user content,
and on the Windows .cmd shim path the command line travels through cmd.exe
(see "Windows .cmd shims" below). `claude -p` with no prompt argument reads
the prompt from stdin. The `system` block is concatenated ahead of the user
content — Claude Code manages prompt caching internally.

`--model` comes from the template's `model` frontmatter, falling back to the
CLI settings model (default `sonnet`; empty string means "omit the flag and
let Claude Code use its own default"). Because the value can ride the cmd.exe
command line on the .cmd shim path, it is validated against
`^[A-Za-z0-9._-]+$` and rejected otherwise.

`--output-format json` returns a single JSON object roughly:

```json
{
  "result": "the assistant text",
  "model": "claude-sonnet-4-6",
  "usage": { "input_tokens": 1234, "output_tokens": 567 },
  "total_cost_usd": 0.0123
}
```

Parse `result` for the user-visible output. Map `usage` and `total_cost_usd` to
`LlmResponse.{inputTokens, outputTokens, costUsd}`. `modelUsage` may list
several models (a haiku helper alongside the main one); `modelUsed` is the one
with the most output tokens. `is_error: true` or a missing `result` string is
surfaced as an `LlmError`.

### Detection

`ClaudeCodeCliProvider.detect(binaryHint, force?)` probes candidates in order
and accepts the first whose `--version` exits 0. Returns `{ found, version, path }`,
cached per session (`force` re-probes).

Candidate order:

1. `binaryHint` (user's binary-path setting). A bare name is resolved like the
   shell would; a path is used as-is.
2. `claude` on PATH — via `where.exe` on Windows (also applies PATHEXT),
   `command -v` on macOS/Linux. Obsidian is an Electron app and may launch
   with a PATH missing the user's shell additions (especially on macOS), which
   is why the static locations below matter.
3. Native installer locations: `%USERPROFILE%\.local\bin\claude.exe` (Windows,
   `irm https://claude.ai/install.ps1 | iex`), `~/.local/bin/claude` (macOS/Linux).
4. npm global install locations (`npm install -g @anthropic-ai/claude-code`):
   - Windows: `%APPDATA%\npm\claude.cmd`, `%ProgramFiles%\nodejs\claude.cmd`
   - macOS/Linux: `/usr/local/bin`, `/opt/homebrew/bin`, `~/.npm-global/bin`,
     `~/.volta/bin`, `~/.nvm/versions/node/*/bin` (newest first)
5. If nothing matched: ask `npm prefix -g` and probe that prefix — covers npm
   under version managers with non-standard prefixes.

Once detected (onboarding or "Test connection"), the resolved absolute path is
persisted to settings so later spawns do not depend on PATH.

### Windows .cmd shims

npm installs `claude.cmd`, a batch shim — not an .exe. Node's `spawn` refuses
to execute `.cmd`/`.bat` directly (EINVAL, CVE-2024-27980 hardening), so
`buildCliSpawn()` routes those through `cmd.exe /d /s /c`. Only trusted,
plugin-controlled args may travel on that command line; the prompt itself must
be written to stdin in `generate()`, never interpolated into the command.

### Failure modes to handle

- `ENOENT` → "Claude Code not found. Install it from claude.ai/code or switch to API key."
- Non-zero exit with `not logged in` in stderr → "Run `claude login` and re-try."
- Timeout (`settings.timeoutSeconds`, default 720s — long STT transcripts need minutes) → "Claude Code took too long. Try a shorter memo or raise the timeout."
- stderr noise without failure → ignore; only `result` parsing controls success.

### Mobile

Constructor throws `LlmError` if `Platform.isMobile`. `main.ts` falls back to
the API-key provider in that case.

### Anthropic ToS note

Using Claude Code as a backend for another tool is **not** a documented use case.
For an individual user's own setup, plugin-spawning the user's own Claude Code
is mechanically identical to the user running it manually, so no Anthropic
license is being redistributed. Document this prominently in the user README
so users know what they are opting into.

## Anthropic API direct (`anthropic.ts`)

Calls the Messages API over Obsidian's `requestUrl`, not `@anthropic-ai/sdk`.
Decided 2026-07-04: `requestUrl` bypasses CORS, behaves identically on desktop
and mobile (this provider is the mobile path), and keeps the SDK out of the
bundle. The request is two headers and three body fields; the SDK bought
nothing.

- `POST https://api.anthropic.com/v1/messages` with `x-api-key` and
  `anthropic-version: 2023-06-01`.
- Default model `claude-sonnet-4-6`, user-overridable in settings.
- `max_tokens` defaults to 8192 — preservation-first outputs scale with input
  (`prd.md`), so leave headroom rather than the tutorial 4096.
- 401 / 429 / other HTTP errors and network failures surface as `LlmError`
  carrying the API's error message.
- `ping` = `GET /v1/models?limit=1` — free, and validates the key.
- `listModels` = `GET /v1/models?limit=1000` — feeds the settings model
  dropdown. Fired only from the "Load model list" button (hard rule 2:
  network calls need an explicit user action).
- Prompt caching: a non-empty `input.system` (the USER CONTEXT block) is sent
  as a system block with `cache_control: { type: "ephemeral" }`. Blocks below
  the model's minimum cache size are silently billed as normal tokens.

### Cost reporting

Anthropic responses include `usage.input_tokens` and `usage.output_tokens`. The
plugin computes cost from `COST_PER_MTOK` in `anthropic.ts`, prefix-matched on
the model id. Unknown models report tokens but no cost. Update the table
alongside anthropic.com/pricing.

## OpenAI-compatible (`openai-compat.ts`)

Plain `requestUrl` `POST ${baseUrl}/chat/completions` (same rationale as the
Anthropic adapter — no `openai` SDK). `Authorization: Bearer` header only when
an API key is set, so local providers work keyless. No `max_tokens` is sent by
default; endpoint defaults are sane and preservation-first outputs scale with
input. `ping` = `GET ${baseUrl}/models`. A 404 on generate hints that the base
URL usually needs to end in `/v1`.

Tested target endpoints:

- OpenAI: `https://api.openai.com/v1`
- Ollama: `http://localhost:11434/v1` (no API key required)
- LM Studio: `http://localhost:1234/v1` (no API key required)
- Groq: `https://api.groq.com/openai/v1`
- Together AI: `https://api.together.xyz/v1`
- OpenRouter: `https://openrouter.ai/api/v1`

Cost reporting is best-effort — endpoints differ in what they return in `usage`.

## Adding a new provider

1. New file under `src/llm/`.
2. Implement `LlmProvider`.
3. Wire into `ExcaveloPlugin.resolveProvider()`.
4. Add to `AuthMethod` union in `src/types.ts`.
5. Add a Settings UI section in `settings-tab.ts`.
6. Update this file + `CLAUDE.md` Sec. 3.
