import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ExcaveloPlugin from "../main";
import type { AuthMethod } from "../types";
import { t } from "../i18n";

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

    containerEl.createEl("h2", { text: t("settings.title") });

    this.renderConnectionSection(containerEl);
    this.renderContextSection(containerEl);
    this.renderTemplatesSection(containerEl);
    this.renderUiSection(containerEl);
  }

  private renderConnectionSection(parent: HTMLElement): void {
    parent.createEl("h3", { text: t("settings.connection.header") });

    new Setting(parent)
      .setName(t("settings.auth-method.name"))
      .setDesc(t("settings.auth-method.desc"))
      .addDropdown((dd) =>
        dd
          .addOption("claude-code-cli", t("settings.auth-method.option.cli"))
          .addOption("anthropic-api", t("settings.auth-method.option.api"))
          .addOption("openai-compat", t("settings.auth-method.option.openai"))
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
      .setName(t("settings.cli.binary.name"))
      .setDesc(t("settings.cli.binary.desc"))
      .addText((tt) =>
        tt
          .setPlaceholder(t("settings.cli.binary.placeholder"))
          .setValue(this.plugin.settings.claudeCodeCli.binaryPath)
          .onChange(async (v) => {
            this.plugin.settings.claudeCodeCli.binaryPath = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(parent)
      .setName(t("settings.cli.permission.name"))
      .setDesc(t("settings.cli.permission.desc"))
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
      .setName(t("settings.cli.timeout.name"))
      .setDesc(t("settings.cli.timeout.desc"))
      .addText((tt) =>
        tt
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
      .setName(t("settings.anthropic.key.name"))
      .setDesc(t("settings.anthropic.key.desc"))
      .addText((tt) => {
        tt.inputEl.type = "password";
        tt.setPlaceholder("sk-ant-...")
          .setValue(this.plugin.settings.anthropicApi.apiKey)
          .onChange(async (v) => {
            this.plugin.settings.anthropicApi.apiKey = v;
            await this.plugin.saveSettings();
          });
      });

    new Setting(parent)
      .setName(t("settings.anthropic.model.name"))
      .addText((tt) =>
        tt
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
      .setName(t("settings.openai.baseurl.name"))
      .setDesc(t("settings.openai.baseurl.desc"))
      .addText((tt) =>
        tt
          .setValue(this.plugin.settings.openAiCompat.baseUrl)
          .onChange(async (v) => {
            this.plugin.settings.openAiCompat.baseUrl = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(parent)
      .setName(t("settings.openai.key.name"))
      .setDesc(t("settings.openai.key.desc"))
      .addText((tt) => {
        tt.inputEl.type = "password";
        tt.setValue(this.plugin.settings.openAiCompat.apiKey).onChange(async (v) => {
          this.plugin.settings.openAiCompat.apiKey = v;
          await this.plugin.saveSettings();
        });
      });

    new Setting(parent)
      .setName(t("settings.openai.model.name"))
      .addText((tt) =>
        tt
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
        .setButtonText(t("settings.test-connection.button"))
        .setCta()
        .onClick(async () => {
          btn.setDisabled(true);
          btn.setButtonText(t("settings.test-connection.testing"));
          try {
            const provider = this.plugin.providerFor(method);
            const result = await provider.ping();
            new Notice(
              result.ok
                ? t("settings.test-connection.ok", { detail: result.detail ?? "" })
                : t("settings.test-connection.fail", { detail: result.detail ?? "unknown" })
            );
          } catch (err) {
            new Notice(t("settings.test-connection.fail", { detail: (err as Error).message }));
          } finally {
            btn.setDisabled(false);
            btn.setButtonText(t("settings.test-connection.button"));
          }
        })
    );
  }

  private renderContextSection(parent: HTMLElement): void {
    parent.createEl("h3", { text: t("settings.context.header") });

    new Setting(parent)
      .setName(t("settings.default-context.name"))
      .setDesc(t("settings.default-context.desc"))
      .addTextArea((tt) => {
        tt.inputEl.rows = 6;
        tt.setValue(this.plugin.settings.defaultContext).onChange(async (v) => {
          this.plugin.settings.defaultContext = v;
          await this.plugin.saveSettings();
        });
      });
  }

  private renderTemplatesSection(parent: HTMLElement): void {
    parent.createEl("h3", { text: t("settings.templates.header") });

    new Setting(parent)
      .setName(t("settings.templates-folder.name"))
      .setDesc(t("settings.templates-folder.desc"))
      .addText((tt) =>
        tt
          .setValue(this.plugin.settings.templatesFolder)
          .onChange(async (v) => {
            this.plugin.settings.templatesFolder = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(parent)
      .setName(t("settings.default-template.name"))
      .setDesc(t("settings.default-template.desc"))
      .addText((tt) =>
        tt
          .setValue(this.plugin.settings.defaultTemplate)
          .onChange(async (v) => {
            this.plugin.settings.defaultTemplate = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(parent).addButton((b) =>
      b.setButtonText(t("settings.open-templates-folder.button")).onClick(() => {
        void this.plugin.openTemplatesFolder();
      })
    );

    new Setting(parent)
      .setName(t("settings.restore-starter.name"))
      .setDesc(t("settings.restore-starter.desc"))
      .addButton((b) =>
        b.setButtonText(t("settings.restore-starter.button")).onClick(async () => {
          await this.plugin.templates.ensureStarter();
          new Notice(t("settings.restore-starter.notice"));
        })
      );
  }

  private renderUiSection(parent: HTMLElement): void {
    parent.createEl("h3", { text: t("settings.ui.header") });

    new Setting(parent)
      .setName(t("settings.status-bar.name"))
      .setDesc(t("settings.status-bar.desc"))
      .addToggle((tt) =>
        tt.setValue(this.plugin.settings.showStatusBar).onChange(async (v) => {
          this.plugin.settings.showStatusBar = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(parent)
      .setName(t("settings.show-cost.name"))
      .setDesc(t("settings.show-cost.desc"))
      .addToggle((tt) =>
        tt.setValue(this.plugin.settings.showCostInPreview).onChange(async (v) => {
          this.plugin.settings.showCostInPreview = v;
          await this.plugin.saveSettings();
        })
      );
  }
}
