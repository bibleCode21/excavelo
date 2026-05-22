import type { LlmResponse, PromptInput } from "../types";

export interface LlmProvider {
  readonly id: string;
  generate(input: PromptInput, opts?: GenerateOptions): Promise<LlmResponse>;
  ping(): Promise<{ ok: boolean; detail?: string }>;
}

export interface GenerateOptions {
  model?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

export class LlmError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = "LlmError";
  }
}
