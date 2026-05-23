const en: Record<string, string> = {
  // Commands
  "command.transform-note": "Transform note...",
  "command.transform-default": "Transform with default template",
  "command.new-note-from-template": "New note from template",
  "command.open-templates-folder": "Open templates folder",

  // Ribbon + context menu
  "ribbon.transform-note": "excaVelo: Transform note",
  "menu.transform-note": "excaVelo: Transform note",

  // Status bar
  "status.ready": "excaVelo: ready",
  "status.thinking": "excaVelo: thinking...",

  // ChooserModal
  "chooser.placeholder.transform": "Choose a template to transform with",
  "chooser.placeholder.new-note": "Choose a template to start a new note from",
  "chooser.default-suffix": "(default)",

  // PreviewModal
  "preview.title": "Preview — {template}",
  "preview.save-to-name": "Save to",
  "preview.save-to-desc": "Used when 'Save as new' is chosen.",
  "preview.action.regenerate": "Regenerate",
  "preview.action.append": "Append to current",
  "preview.action.save-as-new": "Save as new",
  "preview.action.replace": "Replace",
  "preview.action.copy": "Copy",
  "preview.action.discard": "Discard",
  "preview.tooltip.regenerate": "Re-run the transform. LLM output is non-deterministic, so the new response will vary.",
  "preview.tooltip.append": "Add the response below the current note. The raw memo stays in place.",
  "preview.tooltip.save-as-new": "Write the response to the file path in the 'Save to' field above. The current note is not modified.",
  "preview.tooltip.replace": "Overwrite the current note with the response. Cmd+Z (or Ctrl+Z) undoes the replacement.",
  "preview.tooltip.copy": "Copy the response text to the system clipboard. No files change.",
  "preview.tooltip.discard": "Close without saving the response anywhere.",

  // OnboardingModal
  "onboarding.title": "excaVelo setup",
  "onboarding.intro": "Choose how the plugin should talk to Claude. You can change this later in settings.",
  "onboarding.cli.name": "Use Claude Code (recommended)",
  "onboarding.cli.desc": "If you already have Claude Code installed and signed in, the plugin will use it. Works with Claude Pro/Max subscriptions and team accounts. Desktop only.",
  "onboarding.cli.button": "Detect Claude Code",
  "onboarding.cli.detecting": "Detecting...",
  "onboarding.cli.not-found": "Claude Code not found. Install it from claude.ai/code, or set the binary path in settings.",
  "onboarding.cli.detected": "Claude Code detected (version {version}).",
  "onboarding.api.name": "Use Anthropic API key",
  "onboarding.api.desc": "Get a key at console.anthropic.com. Pay-per-token billing, separate from any Claude.ai subscription.",
  "onboarding.api.button": "Use API key",
  "onboarding.api.notice": "Open settings to paste your Anthropic API key.",
  "onboarding.skip": "Skip for now",

  // Settings - top
  "settings.title": "excaVelo",

  // Settings - Connection
  "settings.connection.header": "Connection",
  "settings.auth-method.name": "Authentication method",
  "settings.auth-method.desc": "Claude Code CLI uses your existing Pro/Max subscription via OAuth (no API key needed).",
  "settings.auth-method.option.cli": "Claude Code CLI (recommended)",
  "settings.auth-method.option.api": "Anthropic API key",
  "settings.auth-method.option.openai": "OpenAI-compatible endpoint",

  "settings.cli.binary.name": "Binary path",
  "settings.cli.binary.desc": "Leave empty to auto-detect from PATH.",
  "settings.cli.binary.placeholder": "e.g. /usr/local/bin/claude",
  "settings.cli.permission.name": "Permission mode",
  "settings.cli.permission.desc": "bypassPermissions skips tool-use prompts; safe for pure text generation.",
  "settings.cli.timeout.name": "Timeout (seconds)",
  "settings.cli.timeout.desc": "Maximum time to wait for a Claude Code response.",

  "settings.anthropic.key.name": "API key",
  "settings.anthropic.key.desc": "From console.anthropic.com. Stored locally in data.json.",
  "settings.anthropic.model.name": "Model",

  "settings.openai.baseurl.name": "Base URL",
  "settings.openai.baseurl.desc": "e.g. https://api.openai.com/v1, http://localhost:11434/v1 (Ollama), https://api.groq.com/openai/v1",
  "settings.openai.key.name": "API key",
  "settings.openai.key.desc": "Leave empty for local-only providers like Ollama.",
  "settings.openai.model.name": "Model name",

  "settings.test-connection.button": "Test connection",
  "settings.test-connection.testing": "Testing...",
  "settings.test-connection.ok": "excaVelo: connection OK ({detail})",
  "settings.test-connection.fail": "excaVelo: connection failed — {detail}",

  // Settings - Context
  "settings.context.header": "Context",
  "settings.default-context.name": "Default context",
  "settings.default-context.desc": "Always prepended to the LLM prompt. Put long-lived info here — who you are, your team, your project. Per-note context can override via a [!context] callout.",

  // Settings - Templates
  "settings.templates.header": "Templates",
  "settings.templates-folder.name": "Templates folder",
  "settings.templates-folder.desc": "Markdown files in this folder are auto-discovered as templates.",
  "settings.default-template.name": "Default template",
  "settings.default-template.desc": "Used when transforming without selecting a template.",
  "settings.open-templates-folder.button": "Open templates folder",
  "settings.restore-starter.name": "Restore starter templates",
  "settings.restore-starter.desc": "Re-create the bundled starter templates in the folder above (existing files are not overwritten).",
  "settings.restore-starter.button": "Restore",
  "settings.restore-starter.notice": "Starter templates restored where missing.",

  // Settings - UI
  "settings.ui.header": "UI",
  "settings.status-bar.name": "Status bar",
  "settings.status-bar.desc": "Show a small status item with usage info.",
  "settings.show-cost.name": "Show cost in preview",
  "settings.show-cost.desc": "Display token usage and cost (when reported by the provider).",

  // Notices
  "notice.open-note-first": "Open a note first.",
  "notice.no-templates": "No templates found in '{folder}'. Add a template or restore the starter set.",
  "notice.default-template-missing": "Default template '{name}' not found.",
  "notice.appended": "Appended to current note.",
  "notice.replaced": "Replaced note content.",
  "notice.copied": "Copied to clipboard.",
  "notice.saved": "Saved: {path}",
  "notice.created": "Created: {path}",
  "notice.file-exists": "File already exists: {path}",
  "notice.file-exists-rename": "File already exists: {path}. Rename it first, or wait for a different timestamp.",
  "notice.open-settings-fallback": "Open Settings -> Community plugins -> excaVelo",
  "notice.templates-folder": "Templates folder: {path}",
  "notice.templates-folder-platform": "Templates folder: {path} (open it manually on this platform).",
  "notice.open-folder-failed": "Could not open folder: {detail}",
  "notice.mobile-fallback": "excaVelo: Claude Code CLI is desktop-only — using Anthropic API key on mobile.",
  "notice.error-generic": "excaVelo: {detail}",
  "transform.note-empty": "Note is empty.",
};

export default en;
