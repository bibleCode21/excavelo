import type { PluginSettings } from "../types";

export const DEFAULT_SETTINGS: PluginSettings = {
  authMethod: "claude-code-cli",
  claudeCodeCli: {
    binaryPath: "",
    permissionMode: "bypassPermissions",
    workingDirectory: "vault-root",
    customWorkingDirectory: "",
    timeoutSeconds: 120,
  },
  anthropicApi: {
    apiKey: "",
    model: "claude-sonnet-4-6",
  },
  openAiCompat: {
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o-mini",
  },
  defaultContext: "",
  defaultTemplate: "meeting-minutes",
  templatesFolder: "excaVelo/templates",
  showStatusBar: true,
  showCostInPreview: true,
  hasCompletedOnboarding: false,
};
