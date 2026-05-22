# LLM adapters

All adapters implement `LlmProvider` from `src/llm/llm.ts`:

```ts
interface LlmProvider {
  readonly id: string;
  generate(input: PromptInput, opts?: GenerateOptions): Promise<LlmResponse>;
  ping(): Promise<{ ok: boolean; detail?: string }>;
}

interface PromptInput {
  system: string;  // cacheable USER CONTEXT block (may be empty)
  user: string;    // dynamic per-transform body
}
```

`generate` is the workhorse. `ping` is for "Test connection" in settings.

`PromptInput` separates the stable, cache-friendly context from the dynamic
per-transform body so providers that support prompt caching (Anthropic) can
attach a cache-control breakpoint to the system block.

## Claude Code CLI (`claude-code-cli.ts`) — primary

The team's expected path. Plugin spawns the user's already-authenticated
Claude Code, so no API key is handled by the plugin at all.

### Spawn shape (Claude Code 2.1.x)

```
claude
  -p
  --output-format json
  --permission-mode <default|bypassPermissions>
  [--model <model-id>]
```

The prompt is piped via stdin (avoids OS argv length limits for long memos).

`--output-format json` returns a single JSON object, e.g.:

```json
{
  "type": "result",
  "subtype": "success",
  "result": "the assistant text",
  "usage": {
    "input_tokens": 5,
    "output_tokens": 6,
    "cache_creation_input_tokens": 13897,
    "cache_read_input_tokens": 19211
  },
  "modelUsage": {
    "claude-opus-4-7[1m]": { "inputTokens": 5, "outputTokens": 6, "costUSD": 0.097 }
  },
  "total_cost_usd": 0.0966
}
```

Mapping to `LlmResponse`:

- `result` -> `text`
- `usage.input_tokens` / `usage.output_tokens` -> `inputTokens` / `outputTokens`
- `total_cost_usd` -> `costUsd`
- `modelUsed` = `parsed.model` if present, else first key of `parsed.modelUsage`
  (current Claude Code releases do not emit a top-level `model` field — the
  active model identity is the only key of `modelUsage`).

Prompt caching is enabled by Claude Code itself; `usage.cache_creation_input_tokens`
and `usage.cache_read_input_tokens` surface in the response and account for a
large share of `total_cost_usd` when the same template / default context is
reused across transforms. No plugin-side work is required for the CLI path.

### Detection

`ClaudeCodeCliProvider.detect(binaryHint)`:

1. If `binaryHint` is non-empty, try it first.
2. Otherwise probe `claude` on PATH via a `--version` invocation.
3. On Windows, also probe `%LOCALAPPDATA%\Programs\claude\claude.exe` and
   `%ProgramFiles%\claude\claude.exe`.
4. On macOS / Linux, also probe `/usr/local/bin/claude`,
   `/opt/homebrew/bin/claude`, `~/.local/bin/claude`, `~/.claude/local/claude`.
5. Return `{ found, version, path }`.

### Failure modes to handle

- `ENOENT` → "Claude Code not found. Install it from claude.ai/code or switch to API key."
- Non-zero exit with `not logged in` in stderr → "Run `claude login` and re-try."
- Timeout (`settings.timeoutSeconds`) → "Claude Code took too long. Try a shorter memo or raise the timeout."
- stderr noise without failure → ignore; only `result` parsing controls success.

### Mobile

Constructor throws `LlmError` if `Platform.isMobile`. `ExcaveloPlugin.providerFor()`
catches this implicit constraint earlier: on mobile, a `claude-code-cli`
request is routed to `AnthropicProvider` (with a one-time `Notice` so the user
is aware). If the user has not configured an Anthropic API key, the routing
throws a clear "configure a key in Settings" error.

### Anthropic ToS note

Using Claude Code as a backend for another tool is **not** a documented use case.
For an individual user's own setup, plugin-spawning the user's own Claude Code
is mechanically identical to the user running it manually, so no Anthropic
license is being redistributed. Document this prominently in the user README
so users know what they are opting into.

## Anthropic API direct (`anthropic.ts`)

Standard SDK usage via `@anthropic-ai/sdk` Messages API. Runs in the Electron
renderer, so the client is constructed with `dangerouslyAllowBrowser: true`
(the API key is local-only; no third-party JS reaches it).

Current shape:

- Default model: `claude-sonnet-4-6`. User-overridable in settings.
- `max_tokens` default 4096.
- `PromptInput.system` (when non-empty) is sent as a system content block with
  `cache_control: { type: "ephemeral" }`. Below the model's minimum cache size
  the API silently bills at the normal rate — there is no per-request
  threshold check on the plugin side.
- `messages` carries a single `role: "user"` block with `PromptInput.user`.
- Errors (401 / 429 / network) are surfaced as `LlmError` with the API's
  status + message.

### Cost reporting

`LlmResponse` exposes `inputTokens` and `outputTokens` from the API response.
The provider does **not** compute a USD cost — `costUsd` stays `undefined`
for this path (the preview modal hides the cost field when absent). Adding a
per-model price table is a follow-up if users want it.

## OpenAI-compatible (`openai-compat.ts`)

Uses the `openai` npm SDK with `baseURL` overridden. The SDK is tolerant of
non-OpenAI endpoints as long as they implement `/v1/chat/completions`.

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
