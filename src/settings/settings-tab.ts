import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ExcaveloPlugin from "../main";
import type { AuthMethod } from "../types";

export class ExcaveloSettingTab extends PluginSettingTab {
  plugin: ExcaveloPlugin;

  constructor(app: App, plugin: ExcaveloPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("excavelo-settings");

    containerEl.createEl("h2", { text: "excaVelo" });

    this.renderConnectionSection(containerEl);
    this.renderContextSection(containerEl);
    this.renderTemplatesSection(containerEl);
    this.renderUiSection(containerEl);
  }

  private renderConnectionSection(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Connection" });

    new Setting(parent)
      .setName("Authentication method")
      .setDesc(
        "Claude Code CLI uses your existing Pro/Max subscription via OAuth (no API key needed)."
      )
      .addDropdown((dd) =>
        dd
          .addOption("claude-code-cli", "Claude Code CLI (recommended)")
          .addOption("anthropic-api", "Anthropic API key")
          .addOption("openai-compat", "OpenAI-compatible endpoint")
          .setValue(this.plugin.settings.authMethod)
          .onChange(async (value) => {
            this.plugin.settings.authMethod = value as AuthMethod;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.authMethod === "claude-code-cli") {
      this.renderClaudeCodeCliSettings(parent);
    } else if (this.plugin.settings.authMethod === "anthropic-api") {
      this.renderAnthropicSettings(parent);
    } else {
      this.renderOpenAiCompatSettings(parent);
    }
  }

  private renderClaudeCodeCliSettings(parent: HTMLElement): void {
    new Setting(parent)
      .setName("Binary path")
      .setDesc("Leave empty to auto-detect from PATH.")
      .addText((t) =>
        t
          .setPlaceholder("e.g. /usr/local/bin/claude")
          .setValue(this.plugin.settings.claudeCodeCli.binaryPath)
          .onChange(async (v) => {
            this.plugin.settings.claudeCodeCli.binaryPath = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(parent)
      .setName("Permission mode")
      .setDesc("bypassPermissions skips tool-use prompts; safe for pure text generation.")
      .addDropdown((dd) =>
        dd
          .addOption("default", "default")
          .addOption("bypassPermissions", "bypassPermissions")
          .setValue(this.plugin.settings.claudeCodeCli.permissionMode)
          .onChange(async (v) => {
            this.plugin.settings.claudeCodeCli.permissionMode = v as never;
            await this.plugin.saveSettings();
          })
      );

    new Setting(parent)
      .setName("Timeout (seconds)")
      .setDesc("Maximum time to wait for a Claude Code response.")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.claudeCodeCli.timeoutSeconds))
          .onChange(async (v) => {
            const n = Number(v);
            if (Number.isFinite(n) && n > 0) {
              this.plugin.settings.claudeCodeCli.timeoutSeconds = Math.round(n);
              await this.plugin.saveSettings();
            }
          })
      );

    this.renderTestConnection(parent, "claude-code-cli");
  }

  private renderAnthropicSettings(parent: HTMLElement): void {
    new Setting(parent)
      .setName("API key")
      .setDesc("From console.anthropic.com. Stored locally in data.json.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setPlaceholder("sk-ant-...")
          .setValue(this.plugin.settings.anthropicApi.apiKey)
          .onChange(async (v) => {
            this.plugin.settings.anthropicApi.apiKey = v;
            await this.plugin.saveSettings();
          });
      });

    new Setting(parent)
      .setName("Model")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.anthropicApi.model)
          .onChange(async (v) => {
            this.plugin.settings.anthropicApi.model = v;
            await this.plugin.saveSettings();
          })
      );

    this.renderTestConnection(parent, "anthropic-api");
  }

  private renderOpenAiCompatSettings(parent: HTMLElement): void {
    new Setting(parent)
      .setName("Base URL")
      .setDesc(
        "e.g. https://api.openai.com/v1, http://localhost:11434/v1 (Ollama), https://api.groq.com/openai/v1"
      )
      .addText((t) =>
        t
          .setValue(this.plugin.settings.openAiCompat.baseUrl)
          .onChange(async (v) => {
            this.plugin.settings.openAiCompat.baseUrl = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(parent)
      .setName("API key")
      .setDesc("Leave empty for local-only providers like Ollama.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.settings.openAiCompat.apiKey).onChange(async (v) => {
          this.plugin.settings.openAiCompat.apiKey = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(parent)
      .setName("Model name")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.openAiCompat.model)
          .onChange(async (v) => {
            this.plugin.settings.openAiCompat.model = v;
            await this.plugin.saveSettings();
          })
      );

    this.renderTestConnection(parent, "openai-compat");
  }

  private renderTestConnection(parent: HTMLElement, method: AuthMethod): void {
    new Setting(parent).addButton((btn) =>
      btn
        .setButtonText("Test connection")
        .setCta()
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText("Testing...");
          try {
            const provider = this.plugin.providerFor(method);
            const result = await provider.ping();
            new Notice(
              result.ok
                ? `excaVelo: connection OK (${result.detail ?? ""})`
                : `excaVelo: connection failed — ${result.detail ?? "unknown"}`
            );
          } catch (err) {
            new Notice(`excaVelo: connection failed — ${(err as Error).message}`);
          } finally {
            btn.setDisabled(false);
            btn.setButtonText("Test connection");
          }
        })
    );
  }

  private renderContextSection(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Context" });

    new Setting(parent)
      .setName("Default context")
      .setDesc(
        "Always prepended to the LLM prompt. Put long-lived info here — who you are, your team, your project. Per-note context can override via a [!context] callout."
      )
      .addTextArea((t) => {
        t.inputEl.rows = 6;
        t.setValue(this.plugin.settings.defaultContext).onChange(async (v) => {
          this.plugin.settings.defaultContext = v;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderTemplatesSection(parent: HTMLElement): void {
    parent.createEl("h3", { text: "Templates" });

    new Setting(parent)
      .setName("Templates folder")
      .setDesc("Markdown files in this folder are auto-discovered as templates.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.templatesFolder)
          .onChange(async (v) => {
            this.plugin.settings.templatesFolder = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(parent)
      .setName("Default template")
      .setDesc("Used when transforming without selecting a template.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.defaultTemplate)
          .onChange(async (v) => {
            this.plugin.settings.defaultTemplate = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(parent).addButton((b) =>
      b.setButtonText("Open templates folder").onClick(() => {
        void this.plugin.openTemplatesFolder();
      })
    );

    new Setting(parent)
      .setName("Restore starter templates")
      .setDesc("Re-create the bundled starter templates in the folder above (existing files are not overwritten).")
      .addButton((b) =>
        b.setButtonText("Restore").onClick(async () => {
          await this.plugin.templates.ensureStarter();
          new Notice("Starter templates restored where missing.");
        })
      );
  }

  private renderUiSection(parent: HTMLElement): void {
    parent.createEl("h3", { text: "UI" });

    new Setting(parent)
      .setName("Status bar")
      .setDesc("Show a small status item with usage info.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showStatusBar).onChange(async (v) => {
          this.plugin.settings.showStatusBar = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(parent)
      .setName("Show cost in preview")
      .setDesc("Display token usage and cost (when reported by the provider).")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showCostInPreview).onChange(async (v) => {
          this.plugin.settings.showCostInPreview = v;
          await this.plugin.saveSettings();
        })
      );
  }
}
