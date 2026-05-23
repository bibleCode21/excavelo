/**
 * Shared types for ExcaVelo.
 *
 * Decision references in CLAUDE.md (e.g. "Q5: LLM Provider") map to these types.
 */

export type AuthMethod = "claude-code-cli" | "anthropic-api" | "openai-compat";

export interface ClaudeCodeCliSettings {
  binaryPath: string;
  permissionMode: "default" | "bypassPermissions";
  workingDirectory: "vault-root" | "custom";
  customWorkingDirectory: string;
  timeoutSeconds: number;
}

export interface AnthropicApiSettings {
  apiKey: string;
  model: string;
}

export interface OpenAiCompatSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface PluginSettings {
  authMethod: AuthMethod;
  claudeCodeCli: ClaudeCodeCliSettings;
  anthropicApi: AnthropicApiSettings;
  openAiCompat: OpenAiCompatSettings;

  defaultContext: string;
  defaultTemplate: string;
  templatesFolder: string;

  showStatusBar: boolean;
  showCostInPreview: boolean;
  hasCompletedOnboarding: boolean;
}

export interface Template {
  name: string;
  description: string;
  icon?: string;
  hotkey?: string | null;
  provider?: AuthMethod | null;
  output?: "append" | "new-file" | "preview-first";
  outputFolder?: string;
  outputFilename?: string;
  instruction: string;
  filePath: string;

  // Optional fields used by the "New note from template" command. When absent
  // the command falls back to vault root + a generic callout scaffold.
  newNoteFolder?: string;
  newNoteFilename?: string;
  newNoteScaffold?: string;
}

export interface TransformContext {
  defaultContext: string;
  perNoteContext: string | null;
  rawBody: string;
  template: Template;
  vaultRoot: string;
}

/**
 * Structured prompt fed to LlmProvider.generate.
 *
 * `system` holds cache-friendly static content (e.g. defaultContext) that is
 * stable across transforms; providers may attach prompt-caching breakpoints
 * to it (Anthropic) or pass it as a leading system message (OpenAI). May be
 * empty when the user has not configured a default context.
 *
 * `user` holds the dynamic, per-transform content (per-note context, raw
 * memo, task instruction, output rules). Always populated.
 */
export interface PromptInput {
  system: string;
  user: string;
}

export interface LlmResponse {
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  modelUsed?: string;
}

export interface WikiConfig {
  wikiMode: boolean;
  rawRoot: string;
  wikiRoot: string;
  sourcesPath: string;
  contextFromClaudeMd: boolean;
  templateMapping: Record<string, WikiTemplateMapping>;
}

export interface WikiTemplateMapping {
  savePath?: string;
  filenamePattern?: string;
  frontmatterPreset?: Record<string, unknown>;
}
