import Anthropic from "@anthropic-ai/sdk";
import type { AnthropicApiSettings, LlmResponse, PromptInput } from "../types";
import type { GenerateOptions, LlmProvider } from "./llm";
import { LlmError } from "./llm";

/**
 * Anthropic API direct provider. Used when authMethod = "anthropic-api".
 * Default model: claude-sonnet-4-6. Reference docs/adapters.md.
 *
 * When `input.system` is non-empty, it is sent as a cacheable system block
 * (`cache_control: { type: "ephemeral" }`). Cached blocks below the
 * model's minimum-cache-size threshold are silently billed as normal.
 */
export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic-api";

  constructor(private settings: AnthropicApiSettings) {}

  async generate(input: PromptInput, opts?: GenerateOptions): Promise<LlmResponse> {
    if (!this.settings.apiKey) {
      throw new LlmError("Anthropic API key is not configured.");
    }
    const client = this.client();
    const model = opts?.model ?? this.settings.model ?? "claude-sonnet-4-6";
    try {
      const msg = await client.messages.create({
        model,
        max_tokens: opts?.maxOutputTokens ?? 4096,
        temperature: opts?.temperature,
        system: input.system
          ? [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }]
          : undefined,
        messages: [{ role: "user", content: input.user }],
      });
      const text = msg.content
        .filter((block) => block.type === "text")
        .map((block) => (block as { type: "text"; text: string }).text)
        .join("");
      return {
        text,
        inputTokens: msg.usage?.input_tokens,
        outputTokens: msg.usage?.output_tokens,
        modelUsed: msg.model,
      };
    } catch (err) {
      throw new LlmError(extractAnthropicError(err), err);
    }
  }

  async ping(): Promise<{ ok: boolean; detail?: string }> {
    if (!this.settings.apiKey) return { ok: false, detail: "no api key" };
    try {
      const client = this.client();
      const msg = await client.messages.create({
        model: this.settings.model || "claude-sonnet-4-6",
        max_tokens: 16,
        messages: [{ role: "user", content: "ping" }],
      });
      return { ok: true, detail: `responded with model ${msg.model}` };
    } catch (err) {
      return { ok: false, detail: extractAnthropicError(err) };
    }
  }

  private client(): Anthropic {
    // Obsidian plugins run in an Electron renderer (browser-like environment),
    // so the SDK requires `dangerouslyAllowBrowser` to instantiate. The key is
    // entered locally by the user; no third-party JS reaches it.
    return new Anthropic({ apiKey: this.settings.apiKey, dangerouslyAllowBrowser: true });
  }
}

function extractAnthropicError(err: unknown): string {
  if (err instanceof Error) {
    const status = (err as { status?: number }).status;
    if (status) return `${status}: ${err.message}`;
    return err.message;
  }
  return String(err);
}
