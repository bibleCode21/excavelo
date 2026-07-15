import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ExcaveloPlugin from "../main";
import type { AuthMethod } from "../types";
import { AnthropicProvider } from "../llm/anthropic";
import { OpenAiCompatProvider } from "../llm/openai-compat";
import { setLocaleOverride, t } from "../i18n";

const CLI_MODEL_ALIASES = ["sonnet", "opus", "haiku"];
const CLI_MODEL_CUSTOM = "__custom__";

export class ExcaveloSettingTab extends PluginSettingTab {
  plugin: ExcaveloPlugin;
  /** Model lists fetched on demand via "Load model list"; session-only cache. */
  private modelLists: Partial<Record<"anthropic" | "openai", string[]>> = {};
  /** Keeps the CLI model row in custom mode while the id is being typed. */
  private cliModelCustom = false;

  constructor(app: App, plugin: ExcaveloPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("excavelo-settings");

    new Setting(containerEl).setName(t("settings.title")).setHeading();

    new Setting(containerEl)
      .setName(t("settings.language.name"))
      .setDesc(t("settings.language.desc"))
      .addDropdown((dd) =>
        dd
          .addOption("auto", t("settings.language.option.auto"))
          .addOption("ko", t("settings.language.option.ko"))
          .addOption("en", t("settings.language.option.en"))
          .setValue(this.plugin.settings.language)
          .onChange(async (v) => {
            this.plugin.settings.language = v as never;
            setLocaleOverride(this.plugin.settings.language);
            await this.plugin.saveSettings();
            this.display();
          })
      );

    this.renderConnectionSection(containerEl);
    this.renderContextSection(containerEl);
    this.renderTemplatesSection(containerEl);
    this.renderUiSection(containerEl);
  }

  private renderConnectionSection(parent: HTMLElement): void {
    new Setting(parent).setName(t("settings.connection.header")).setHeading();

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

    const currentModel = this.plugin.settings.claudeCodeCli.model;
    const isCustom =
      this.cliModelCustom || (currentModel !== "" && !CLI_MODEL_ALIASES.includes(currentModel));

    new Setting(parent)
      .setName(t("settings.cli.model.name"))
      .setDesc(t("settings.cli.model.desc"))
      .addDropdown((dd) =>
        dd
          .addOption("sonnet", t("settings.cli.model.option.sonnet"))
          .addOption("opus", t("settings.cli.model.option.opus"))
          .addOption("haiku", t("settings.cli.model.option.haiku"))
          .addOption("", t("settings.cli.model.option.default"))
          .addOption(CLI_MODEL_CUSTOM, t("settings.cli.model.option.custom"))
          .setValue(isCustom ? CLI_MODEL_CUSTOM : currentModel)
          .onChange(async (v) => {
            this.cliModelCustom = v === CLI_MODEL_CUSTOM;
            if (!this.cliModelCustom) {
              this.plugin.settings.claudeCodeCli.model = v;
              await this.plugin.saveSettings();
            }
            this.display();
          })
      );

    if (isCustom) {
      new Setting(parent)
        .setName(t("settings.cli.custom-model.name"))
        .setDesc(t("settings.cli.custom-model.desc"))
        .addText((tt) =>
          tt
            .setPlaceholder("claude-sonnet-4-6")
            .setValue(CLI_MODEL_ALIASES.includes(currentModel) ? "" : currentModel)
            .onChange(async (v) => {
              this.plugin.settings.claudeCodeCli.model = v.trim();
              await this.plugin.saveSettings();
            })
        );
    }

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
      .addText((tt) => {
        tt.inputEl.type = "number";
        tt.inputEl.min = "1";
        tt.setPlaceholder("720")
          .setValue(String(this.plugin.settings.claudeCodeCli.timeoutSeconds))
          .onChange(async (v) => {
            const n = Math.floor(Number(v));
            // Ignore empty/invalid input rather than clobbering with NaN; the
            // provider also falls back to the default when the value is 0.
            if (Number.isFinite(n) && n > 0) {
              this.plugin.settings.claudeCodeCli.timeoutSeconds = n;
              await this.plugin.saveSettings();
            }
          });
      });

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

    this.renderApiModelSetting(parent, {
      cacheKey: "anthropic",
      getValue: () => this.plugin.settings.anthropicApi.model,
      setValue: async (v) => {
        this.plugin.settings.anthropicApi.model = v;
        await this.plugin.saveSettings();
      },
      fetchModels: () => new AnthropicProvider(this.plugin.settings.anthropicApi).listModels(),
    });

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

    this.renderApiModelSetting(parent, {
      cacheKey: "openai",
      getValue: () => this.plugin.settings.openAiCompat.model,
      setValue: async (v) => {
        this.plugin.settings.openAiCompat.model = v;
        await this.plugin.saveSettings();
      },
      fetchModels: () => new OpenAiCompatProvider(this.plugin.settings.openAiCompat).listModels(),
    });

    this.renderTestConnection(parent, "openai-compat");
  }

  /**
   * Model picker for the API providers. Starts as a free-text field; "Load
   * model list" fetches the endpoint's catalog (explicit user action — hard
   * rule 2) and re-renders the row as a dropdown for this settings session.
   */
  private renderApiModelSetting(
    parent: HTMLElement,
    opts: {
      cacheKey: "anthropic" | "openai";
      getValue: () => string;
      setValue: (v: string) => Promise<void>;
      fetchModels: () => Promise<string[]>;
    }
  ): void {
    const models = this.modelLists[opts.cacheKey];
    const setting = new Setting(parent).setName(t("settings.api-model.name"));

    if (models) {
      setting.setDesc(t("settings.api-model.desc-loaded", { count: models.length }));
      setting.addDropdown((dd) => {
        const current = opts.getValue();
        if (current && !models.includes(current)) {
          dd.addOption(current, `${current} (current)`);
        }
        for (const m of models) dd.addOption(m, m);
        dd.setValue(current || models[0]).onChange(async (v) => {
          await opts.setValue(v);
        });
      });
    } else {
      setting.setDesc(t("settings.api-model.desc-text"));
      setting.addText((tt) =>
        tt.setValue(opts.getValue()).onChange(async (v) => {
          await opts.setValue(v.trim());
        })
      );
    }

    setting.addButton((btn) =>
      btn
        .setButtonText(models ? t("settings.api-model.reload") : t("settings.api-model.load"))
        .onClick(async () => {
          btn.setDisabled(true).setButtonText(t("settings.api-model.loading"));
          try {
            this.modelLists[opts.cacheKey] = await opts.fetchModels();
            this.display();
          } catch (err) {
            new Notice(t("settings.api-model.failed", { error: (err as Error).message }));
            btn
              .setDisabled(false)
              .setButtonText(models ? t("settings.api-model.reload") : t("settings.api-model.load"));
          }
        })
    );
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
    new Setting(parent).setName(t("settings.context.header")).setHeading();

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
    new Setting(parent).setName(t("settings.templates.header")).setHeading();

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

    new Setting(parent)
      .setName(t("settings.update-starter.name"))
      .setDesc(t("settings.update-starter.desc"))
      .addButton((b) =>
        b.setButtonText(t("settings.update-starter.button")).setDestructive().onClick(async () => {
          await this.plugin.templates.forceWriteStarter();
          new Notice(t("settings.update-starter.notice"));
        })
      );
  }

  private renderUiSection(parent: HTMLElement): void {
    new Setting(parent).setName(t("settings.ui.header")).setHeading();

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
