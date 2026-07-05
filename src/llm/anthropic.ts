import { requestUrl } from "obsidian";
import type { AnthropicApiSettings, LlmResponse, PromptInput } from "../types";
import type { GenerateOptions, LlmProvider } from "./llm";
import { LlmError } from "./llm";

/**
 * Anthropic API direct provider. Used when authMethod = "anthropic-api".
 *
 * Calls the Messages API over Obsidian's requestUrl rather than the SDK:
 * requestUrl bypasses CORS, works identically on desktop and mobile (this is
 * the mobile path), and keeps the SDK out of the bundle.
 *
 * When `input.system` is non-empty, it is sent as a cacheable system block
 * (`cache_control: { type: "ephemeral" }`). Cached blocks below the model's
 * minimum-cache-size threshold are silently billed as normal.
 */

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const MODELS_URL = "https://api.anthropic.com/v1/models?limit=1";
const MODELS_LIST_URL = "https://api.anthropic.com/v1/models?limit=1000";
const ANTHROPIC_VERSION = "2023-06-01";

// Preservation-first outputs scale with input (docs/prd.md), so leave
// generous headroom instead of the SDK-tutorial 4096.
const DEFAULT_MAX_TOKENS = 8192;

/**
 * USD per million tokens, prefix-matched on the model id. Best-effort: an
 * unknown model simply reports no cost. Update alongside anthropic.com/pricing.
 */
const COST_PER_MTOK: ReadonlyArray<{ prefix: string; input: number; output: number }> = [
  { prefix: "claude-opus-4", input: 15, output: 75 },
  { prefix: "claude-sonnet-4", input: 3, output: 15 },
  { prefix: "claude-haiku-4", input: 1, output: 5 },
  { prefix: "claude-3-5-haiku", input: 0.8, output: 4 },
];

function computeCostUsd(
  model: string | undefined,
  inputTokens: number | undefined,
  outputTokens: number | undefined
): number | undefined {
  if (!model || inputTokens === undefined || outputTokens === undefined) return undefined;
  const rate = COST_PER_MTOK.find((r) => model.startsWith(r.prefix));
  if (!rate) return undefined;
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}

interface AnthropicMessageResponse {
  content?: Array<{ type?: string; text?: string }>;
  model?: string;
  usage?: { input_tokens?: unknown; output_tokens?: unknown };
  error?: { type?: string; message?: string };
}

function parseBody(text: string): AnthropicMessageResponse {
  try {
    return JSON.parse(text) as AnthropicMessageResponse;
  } catch {
    throw new LlmError(`Anthropic API returned unparseable output: ${text.slice(0, 300)}`);
  }
}

function apiErrorDetail(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as AnthropicMessageResponse;
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // fall through to raw text
  }
  return bodyText.slice(0, 300);
}

export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic-api";

  constructor(private settings: AnthropicApiSettings) {}

  async generate(input: PromptInput, opts?: GenerateOptions): Promise<LlmResponse> {
    if (!this.settings.apiKey) {
      throw new LlmError("Anthropic API key is not configured. Add one in settings.");
    }
    const model = opts?.model ?? this.settings.model;

    let res;
    try {
      res = await requestUrl({
        url: MESSAGES_URL,
        method: "POST",
        contentType: "application/json",
        headers: {
          "x-api-key": this.settings.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: opts?.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
          ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
          ...(input.system
            ? {
                system: [
                  {
                    type: "text",
                    text: input.system,
                    cache_control: { type: "ephemeral" },
                  },
                ],
              }
            : {}),
          messages: [{ role: "user", content: input.user }],
        }),
        throw: false,
      });
    } catch (e) {
      throw new LlmError(
        `Could not reach the Anthropic API (${(e as Error).message}). Check your network.`,
        e
      );
    }

    if (res.status === 401) {
      throw new LlmError("Anthropic API rejected the key (401). Check it in settings.");
    }
    if (res.status === 429) {
      throw new LlmError("Anthropic API rate limit reached (429). Wait a moment and retry.");
    }
    if (res.status >= 400) {
      throw new LlmError(`Anthropic API error ${res.status}: ${apiErrorDetail(res.text)}`);
    }

    const data = parseBody(res.text);
    const text = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text as string)
      .join("");
    if (!text) {
      throw new LlmError("Anthropic API returned an empty response.");
    }

    const usage = data.usage ?? {};
    const inputTokens = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
    const outputTokens = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
    return {
      text,
      inputTokens,
      outputTokens,
      costUsd: computeCostUsd(data.model, inputTokens, outputTokens),
      modelUsed: data.model,
    };
  }

  /** Model ids available to this key, API order (newest first). Settings UI only. */
  async listModels(): Promise<string[]> {
    if (!this.settings.apiKey) {
      throw new LlmError("Anthropic API key is not configured. Add one first.");
    }
    const res = await requestUrl({
      url: MODELS_LIST_URL,
      method: "GET",
      headers: {
        "x-api-key": this.settings.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      throw: false,
    });
    if (res.status !== 200) {
      throw new LlmError(`Anthropic API error ${res.status}: ${apiErrorDetail(res.text)}`);
    }
    const data = JSON.parse(res.text) as { data?: Array<{ id?: unknown }> };
    const ids = (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string");
    if (ids.length === 0) throw new LlmError("Anthropic API returned no models.");
    return ids;
  }

  async ping(): Promise<{ ok: boolean; detail?: string }> {
    if (!this.settings.apiKey) return { ok: false, detail: "no api key" };
    try {
      const res = await requestUrl({
        url: MODELS_URL,
        method: "GET",
        headers: {
          "x-api-key": this.settings.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        throw: false,
      });
      if (res.status === 200) {
        return { ok: true, detail: `key accepted, model ${this.settings.model}` };
      }
      if (res.status === 401) return { ok: false, detail: "invalid api key" };
      return { ok: false, detail: `HTTP ${res.status}: ${apiErrorDetail(res.text)}` };
    } catch (e) {
      return { ok: false, detail: `network error: ${(e as Error).message}` };
    }
  }
}
