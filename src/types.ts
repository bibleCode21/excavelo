/**
 * Shared types for ExcaVelo.
 *
 * Decision references in CLAUDE.md (e.g. "Q5: LLM Provider") map to these types.
 */

export type AuthMethod = "claude-code-cli" | "anthropic-api" | "openai-compat";

export interface ClaudeCodeCliSettings {
  binaryPath: string;
  /** Alias (sonnet, opus, haiku) or full model id. Empty = Claude Code's own default. */
  model: string;
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
  /** UI language; "auto" follows Obsidian's app language. */
  language: "auto" | "en" | "ko";
  authMethod: AuthMethod;
  claudeCodeCli: ClaudeCodeCliSettings;
  anthropicApi: AnthropicApiSettings;
  openAiCompat: OpenAiCompatSettings;

  defaultContext: string;
  defaultTemplate: string;
  templatesFolder: string;

  showStatusBar: boolean;
  showCostInPreview: boolean;
  /** Run the verify→repair completeness chain after each transform. */
  verifyCompleteness: boolean;
  hasCompletedOnboarding: boolean;
}

export interface Template {
  name: string;
  description: string;
  /** Korean description shown in the chooser when the UI locale is Korean. */
  descriptionKo?: string;
  icon?: string;
  hotkey?: string | null;
  provider?: AuthMethod | null;
  /** Per-template model override; null defers to the provider's setting. */
  model?: string | null;
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
  /** Contents of [!stt]-linked transcript files; null when the memo has none. */
  transcript: string | null;
  /** git log output for [!git] repo specs; null when the memo has none. */
  gitLog: string | null;
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

/**
 * Outcome of the completeness verify→repair chain
 * (docs/specs/completeness-verify-chain.md).
 *
 * - `verified` — verify pass found nothing missing.
 * - `repaired` — verify listed misses; one repair call reinserted them
 *   (`repairedCount`).
 * - `verify-failed` — verify/repair errored, unparseable, or repair output
 *   was degenerate; the original transform output is kept (fail-open).
 * - `skipped-git` — [!git] notes skip the chain (selection-criteria items
 *   would be misjudged as misses and repaired into fabrications).
 */
export type VerificationStatus = "verified" | "repaired" | "verify-failed" | "skipped-git";

export interface VerificationResult {
  status: VerificationStatus;
  /** Number of missing facts the repair call reinserted (repaired only). */
  repairedCount?: number;
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
