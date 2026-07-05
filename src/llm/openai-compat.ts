import { requestUrl } from "obsidian";
import type { LlmResponse, OpenAiCompatSettings, PromptInput } from "../types";
import type { GenerateOptions, LlmProvider } from "./llm";
import { LlmError } from "./llm";

/**
 * OpenAI-compatible HTTP provider. Works with OpenAI, Ollama, LM Studio, Groq,
 * Together, OpenRouter, vLLM, etc. — anything that exposes /v1/chat/completions.
 *
 * Plain requestUrl instead of the openai SDK: bypasses CORS, works on mobile,
 * and the request shape is two fields anyway. `input.system` is sent as a
 * standard system message when non-empty — forward-compatible with endpoints
 * that add prompt caching.
 */

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>;
  model?: string;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
  error?: unknown;
}

/** OpenAI nests error.message; Ollama and friends return a bare error string. */
function apiErrorDetail(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as ChatCompletionResponse;
    const err = parsed.error;
    if (typeof err === "string") return err;
    if (err && typeof (err as { message?: unknown }).message === "string") {
      return (err as { message: string }).message;
    }
  } catch {
    // fall through to raw text
  }
  return bodyText.slice(0, 300);
}

export class OpenAiCompatProvider implements LlmProvider {
  readonly id = "openai-compat";

  constructor(private settings: OpenAiCompatSettings) {}

  private endpoint(path: string): string {
    return this.settings.baseUrl.replace(/\/+$/, "") + path;
  }

  private headers(): Record<string, string> {
    // Local providers (Ollama, LM Studio) run without a key.
    return this.settings.apiKey
      ? { Authorization: `Bearer ${this.settings.apiKey}` }
      : {};
  }

  async generate(input: PromptInput, opts?: GenerateOptions): Promise<LlmResponse> {
    if (!this.settings.baseUrl) {
      throw new LlmError("OpenAI-compatible base URL is not configured.");
    }
    const model = opts?.model ?? this.settings.model;
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    if (input.system) messages.push({ role: "system", content: input.system });
    messages.push({ role: "user", content: input.user });

    let res;
    try {
      res = await requestUrl({
        url: this.endpoint("/chat/completions"),
        method: "POST",
        contentType: "application/json",
        headers: this.headers(),
        body: JSON.stringify({
          model,
          // No max_tokens by default: preservation-first outputs scale with
          // input (docs/prd.md), and endpoint defaults are sane.
          ...(opts?.maxOutputTokens !== undefined ? { max_tokens: opts.maxOutputTokens } : {}),
          ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
          messages,
        }),
        throw: false,
      });
    } catch (e) {
      throw new LlmError(
        `Could not reach ${this.settings.baseUrl} (${(e as Error).message}). ` +
          "Check the base URL and that the server is running.",
        e
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new LlmError(`Endpoint rejected the API key (${res.status}). Check it in settings.`);
    }
    if (res.status === 404) {
      throw new LlmError(
        `${this.endpoint("/chat/completions")} returned 404. ` +
          "The base URL usually needs to end in /v1."
      );
    }
    if (res.status === 429) {
      throw new LlmError("Endpoint rate limit reached (429). Wait a moment and retry.");
    }
    if (res.status >= 400) {
      throw new LlmError(`Endpoint error ${res.status}: ${apiErrorDetail(res.text)}`);
    }

    let data: ChatCompletionResponse;
    try {
      data = JSON.parse(res.text) as ChatCompletionResponse;
    } catch {
      throw new LlmError(`Endpoint returned unparseable output: ${res.text.slice(0, 300)}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content) {
      throw new LlmError("Endpoint returned an empty response.");
    }

    const usage = data.usage ?? {};
    return {
      text: content,
      inputTokens: typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined,
      outputTokens:
        typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined,
      // Cost reporting is best-effort per docs/adapters.md; the OpenAI shape
      // carries no price info and model catalogs vary per endpoint.
      costUsd: undefined,
      modelUsed: data.model,
    };
  }

  /** Model ids the endpoint reports, sorted. Settings UI only. */
  async listModels(): Promise<string[]> {
    if (!this.settings.baseUrl) {
      throw new LlmError("OpenAI-compatible base URL is not configured.");
    }
    const res = await requestUrl({
      url: this.endpoint("/models"),
      method: "GET",
      headers: this.headers(),
      throw: false,
    });
    if (res.status < 200 || res.status >= 300) {
      throw new LlmError(`Endpoint error ${res.status}: ${apiErrorDetail(res.text)}`);
    }
    const data = JSON.parse(res.text) as { data?: Array<{ id?: unknown }> };
    const ids = (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === "string")
      .sort();
    if (ids.length === 0) throw new LlmError("Endpoint returned no models.");
    return ids;
  }

  async ping(): Promise<{ ok: boolean; detail?: string }> {
    if (!this.settings.baseUrl) return { ok: false, detail: "no base URL" };
    try {
      const res = await requestUrl({
        url: this.endpoint("/models"),
        method: "GET",
        headers: this.headers(),
        throw: false,
      });
      if (res.status >= 200 && res.status < 300) {
        return { ok: true, detail: `${this.settings.baseUrl} reachable` };
      }
      if (res.status === 401 || res.status === 403) {
        return { ok: false, detail: "invalid api key" };
      }
      return { ok: false, detail: `HTTP ${res.status}: ${apiErrorDetail(res.text)}` };
    } catch (e) {
      return { ok: false, detail: `network error: ${(e as Error).message}` };
    }
  }
}
