import OpenAI from "openai";
import type { LlmResponse, OpenAiCompatSettings, PromptInput } from "../types";
import type { GenerateOptions, LlmProvider } from "./llm";
import { LlmError } from "./llm";

/**
 * OpenAI-compatible HTTP provider. Works with OpenAI, Ollama, LM Studio, Groq,
 * Together, OpenRouter, vLLM, etc. — anything that exposes /v1/chat/completions.
 *
 * `input.system` is sent as a standard system message when non-empty. Most
 * OpenAI-compatible endpoints do not yet expose a prompt-caching control;
 * the system message form is forward-compatible with future support.
 */
export class OpenAiCompatProvider implements LlmProvider {
  readonly id = "openai-compat";

  constructor(private settings: OpenAiCompatSettings) {}

  async generate(input: PromptInput, opts?: GenerateOptions): Promise<LlmResponse> {
    if (!this.settings.baseUrl) {
      throw new LlmError("OpenAI-compatible base URL is not configured.");
    }
    const client = this.client();
    const model = opts?.model ?? this.settings.model ?? "gpt-4o-mini";
    const messages: { role: "system" | "user"; content: string }[] = [];
    if (input.system) messages.push({ role: "system", content: input.system });
    messages.push({ role: "user", content: input.user });
    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: opts?.temperature,
        max_tokens: opts?.maxOutputTokens,
        messages,
      });
      const text = completion.choices[0]?.message?.content ?? "";
      if (!text) throw new LlmError("Provider returned an empty completion.");
      return {
        text,
        inputTokens: completion.usage?.prompt_tokens,
        outputTokens: completion.usage?.completion_tokens,
        modelUsed: completion.model,
      };
    } catch (err) {
      if (err instanceof LlmError) throw err;
      throw new LlmError(extractError(err), err);
    }
  }

  async ping(): Promise<{ ok: boolean; detail?: string }> {
    if (!this.settings.baseUrl) return { ok: false, detail: "no base URL" };
    try {
      const client = this.client();
      const completion = await client.chat.completions.create({
        model: this.settings.model || "gpt-4o-mini",
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      });
      return { ok: true, detail: `responded with model ${completion.model}` };
    } catch (err) {
      return { ok: false, detail: extractError(err) };
    }
  }

  private client(): OpenAI {
    // Obsidian plugins run in an Electron renderer (browser-like environment),
    // so the SDK requires `dangerouslyAllowBrowser` to instantiate. The key is
    // entered locally by the user; no third-party JS reaches it.
    return new OpenAI({
      apiKey: this.settings.apiKey || "not-needed",
      baseURL: this.settings.baseUrl,
      dangerouslyAllowBrowser: true,
    });
  }
}

function extractError(err: unknown): string {
  if (err instanceof Error) {
    const status = (err as { status?: number }).status;
    if (status) return `${status}: ${err.message}`;
    return err.message;
  }
  return String(err);
}
