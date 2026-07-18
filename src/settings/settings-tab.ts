import { App, Notice, PluginSettingTab, Setting, requireApiVersion } from "obsidian";
import type { SettingDefinitionGroup, SettingDefinitionItem, SettingGroupItem } from "obsidian";
import type ExcaveloPlugin from "../main";
import type { AuthMethod } from "../types";
import { AnthropicProvider } from "../llm/anthropic";
import { OpenAiCompatProvider } from "../llm/openai-compat";
import { setLocaleOverride, t } from "../i18n";

const CLI_MODEL_ALIASES = ["sonnet", "opus", "haiku"];
const CLI_MODEL_CUSTOM = "__custom__";

function isVisible(v: boolean | (() => boolean) | undefined): boolean {
  return typeof v === "function" ? v() : v !== false;
}

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

  private isCliModelCustom(): boolean {
    const currentModel = this.plugin.settings.claudeCodeCli.model;
    return (
      this.cliModelCustom || (currentModel !== "" && !CLI_MODEL_ALIASES.includes(currentModel))
    );
  }

  /**
   * Fallback for Obsidian <1.13, where getSettingDefinitions() does not
   * exist: interprets the same definition tree imperatively (the official
   * fallback pattern — obsidian.d.ts, display()'s docstring).
   */
  display(): void {
    this.containerEl.empty();
    this.renderDefinitions(this.getSettingDefinitions());
  }

  // The probe (scripts/probe-settings-tab.mjs) keeps its own independent
  // interpretation of this tree as an oracle — do not merge or share code
  // with it (settings-dual-path §Spec).
  private renderDefinitions(items: SettingDefinitionItem[] | SettingGroupItem[]): void {
    for (const item of items) {
      if ("type" in item) {
        if (item.type === "page") continue; // not used by this tab
        if (!isVisible(item.visible)) continue;
        if (item.heading) new Setting(this.containerEl).setName(item.heading).setHeading();
        this.renderDefinitions(item.items ?? []);
      } else {
        if (!isVisible(item.visible)) continue;
        const setting = new Setting(this.containerEl);
        if (item.name !== undefined) setting.setName(item.name);
        if (item.desc !== undefined) setting.setDesc(item.desc);
        // The group argument is unused by every definition in this tab, and
        // SettingGroup cannot be constructed below 1.11 — hence the cast.
        if (typeof item.render === "function") {
          (item.render as (setting: Setting) => void)(setting);
        }
      }
    }
  }

  /**
   * Full re-render of the tab: update() on Obsidian 1.13+, the display()
   * fallback on versions below 1.13. (Unlike 1.13's refreshDomState(), this
   * is not a cheap in-place state toggle — it rebuilds every row.)
   */
  private refresh(): void {
    if (requireApiVersion("1.13.0")) {
      this.update();
    } else {
      this.display();
    }
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    this.containerEl.addClass("excavelo-settings");

    return [
      {
        name: t("settings.title"),
        render: (setting) => {
          setting.setName(t("settings.title")).setHeading();
        },
      },
      {
        name: t("settings.language.name"),
        desc: t("settings.language.desc"),
        render: (setting) => {
          setting.addDropdown((dd) =>
            dd
              .addOption("auto", t("settings.language.option.auto"))
              .addOption("ko", t("settings.language.option.ko"))
              .addOption("en", t("settings.language.option.en"))
              .setValue(this.plugin.settings.language)
              .onChange(async (v) => {
                this.plugin.settings.language = v as never;
                setLocaleOverride(this.plugin.settings.language);
                await this.plugin.saveSettings();
                this.refresh();
              })
          );
        },
      },
      this.connectionGroup(),
      this.contextGroup(),
      this.templatesGroup(),
      this.uiGroup(),
    ];
  }

  private connectionGroup(): SettingDefinitionGroup {
    return {
      type: "group",
      heading: t("settings.connection.header"),
      items: [
        {
          name: t("settings.auth-method.name"),
          desc: t("settings.auth-method.desc"),
          render: (setting) => {
            setting.addDropdown((dd) =>
              dd
                .addOption("claude-code-cli", t("settings.auth-method.option.cli"))
                .addOption("anthropic-api", t("settings.auth-method.option.api"))
                .addOption("openai-compat", t("settings.auth-method.option.openai"))
                .setValue(this.plugin.settings.authMethod)
                .onChange(async (value) => {
                  this.plugin.settings.authMethod = value as AuthMethod;
                  await this.plugin.saveSettings();
                  this.refresh();
                })
            );
          },
        },
        ...this.claudeCodeCliItems(),
        ...this.anthropicItems(),
        ...this.openAiCompatItems(),
      ],
    };
  }

  private claudeCodeCliItems(): SettingGroupItem[] {
    const visible = () => this.plugin.settings.authMethod === "claude-code-cli";
    return [
      {
        name: t("settings.cli.binary.name"),
        desc: t("settings.cli.binary.desc"),
        visible,
        render: (setting) => {
          setting.addText((tt) =>
            tt
              .setPlaceholder(t("settings.cli.binary.placeholder"))
              .setValue(this.plugin.settings.claudeCodeCli.binaryPath)
              .onChange(async (v) => {
                this.plugin.settings.claudeCodeCli.binaryPath = v;
                await this.plugin.saveSettings();
              })
          );
        },
      },
      {
        name: t("settings.cli.model.name"),
        desc: t("settings.cli.model.desc"),
        visible,
        render: (setting) => {
          const currentModel = this.plugin.settings.claudeCodeCli.model;
          const isCustom = this.isCliModelCustom();
          setting.addDropdown((dd) =>
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
                this.refresh();
              })
          );
        },
      },
      {
        name: t("settings.cli.custom-model.name"),
        desc: t("settings.cli.custom-model.desc"),
        visible: () => visible() && this.isCliModelCustom(),
        render: (setting) => {
          const currentModel = this.plugin.settings.claudeCodeCli.model;
          setting.addText((tt) =>
            tt
              .setPlaceholder("claude-sonnet-4-6")
              .setValue(CLI_MODEL_ALIASES.includes(currentModel) ? "" : currentModel)
              .onChange(async (v) => {
                this.plugin.settings.claudeCodeCli.model = v.trim();
                await this.plugin.saveSettings();
              })
          );
        },
      },
      {
        name: t("settings.cli.permission.name"),
        desc: t("settings.cli.permission.desc"),
        visible,
        render: (setting) => {
          setting.addDropdown((dd) =>
            dd
              .addOption("default", "default")
              .addOption("bypassPermissions", "bypassPermissions")
              .setValue(this.plugin.settings.claudeCodeCli.permissionMode)
              .onChange(async (v) => {
                this.plugin.settings.claudeCodeCli.permissionMode = v as never;
                await this.plugin.saveSettings();
              })
          );
        },
      },
      {
        name: t("settings.cli.timeout.name"),
        desc: t("settings.cli.timeout.desc"),
        visible,
        render: (setting) => {
          setting.addText((tt) => {
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
        },
      },
      this.testConnectionItem("claude-code-cli", visible),
    ];
  }

  private anthropicItems(): SettingGroupItem[] {
    const visible = () => this.plugin.settings.authMethod === "anthropic-api";
    return [
      {
        name: t("settings.anthropic.key.name"),
        desc: t("settings.anthropic.key.desc"),
        visible,
        render: (setting) => {
          setting.addText((tt) => {
            tt.inputEl.type = "password";
            tt.setPlaceholder("sk-ant-...")
              .setValue(this.plugin.settings.anthropicApi.apiKey)
              .onChange(async (v) => {
                this.plugin.settings.anthropicApi.apiKey = v;
                await this.plugin.saveSettings();
              });
          });
        },
      },
      this.apiModelItem(visible, {
        cacheKey: "anthropic",
        getValue: () => this.plugin.settings.anthropicApi.model,
        setValue: async (v) => {
          this.plugin.settings.anthropicApi.model = v;
          await this.plugin.saveSettings();
        },
        fetchModels: () => new AnthropicProvider(this.plugin.settings.anthropicApi).listModels(),
      }),
      this.testConnectionItem("anthropic-api", visible),
    ];
  }

  private openAiCompatItems(): SettingGroupItem[] {
    const visible = () => this.plugin.settings.authMethod === "openai-compat";
    return [
      {
        name: t("settings.openai.baseurl.name"),
        desc: t("settings.openai.baseurl.desc"),
        visible,
        render: (setting) => {
          setting.addText((tt) =>
            tt.setValue(this.plugin.settings.openAiCompat.baseUrl).onChange(async (v) => {
              this.plugin.settings.openAiCompat.baseUrl = v;
              await this.plugin.saveSettings();
            })
          );
        },
      },
      {
        name: t("settings.openai.key.name"),
        desc: t("settings.openai.key.desc"),
        visible,
        render: (setting) => {
          setting.addText((tt) => {
            tt.inputEl.type = "password";
            tt.setValue(this.plugin.settings.openAiCompat.apiKey).onChange(async (v) => {
              this.plugin.settings.openAiCompat.apiKey = v;
              await this.plugin.saveSettings();
            });
          });
        },
      },
      this.apiModelItem(visible, {
        cacheKey: "openai",
        getValue: () => this.plugin.settings.openAiCompat.model,
        setValue: async (v) => {
          this.plugin.settings.openAiCompat.model = v;
          await this.plugin.saveSettings();
        },
        fetchModels: () =>
          new OpenAiCompatProvider(this.plugin.settings.openAiCompat).listModels(),
      }),
      this.testConnectionItem("openai-compat", visible),
    ];
  }

  /**
   * Model picker for the API providers. Starts as a free-text field; "Load
   * model list" fetches the endpoint's catalog (explicit user action — hard
   * rule 2) and re-renders the row as a dropdown for this settings session.
   */
  private apiModelItem(
    visible: () => boolean,
    opts: {
      cacheKey: "anthropic" | "openai";
      getValue: () => string;
      setValue: (v: string) => Promise<void>;
      fetchModels: () => Promise<string[]>;
    }
  ): SettingGroupItem {
    return {
      name: t("settings.api-model.name"),
      desc: "",
      visible,
      render: (setting) => {
        const models = this.modelLists[opts.cacheKey];

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
                this.refresh();
              } catch (err) {
                new Notice(t("settings.api-model.failed", { error: (err as Error).message }));
                btn
                  .setDisabled(false)
                  .setButtonText(
                    models ? t("settings.api-model.reload") : t("settings.api-model.load")
                  );
              }
            })
        );
      },
    };
  }

  private testConnectionItem(method: AuthMethod, visible: () => boolean): SettingGroupItem {
    return {
      name: t("settings.test-connection.button"),
      desc: "",
      visible,
      render: (setting) => {
        setting.setName("").setDesc("");
        setting.addButton((btn) =>
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
      },
    };
  }

  private contextGroup(): SettingDefinitionGroup {
    return {
      type: "group",
      heading: t("settings.context.header"),
      items: [
        {
          name: t("settings.default-context.name"),
          desc: t("settings.default-context.desc"),
          render: (setting) => {
            setting.addTextArea((tt) => {
              tt.inputEl.rows = 6;
              tt.setValue(this.plugin.settings.defaultContext).onChange(async (v) => {
                this.plugin.settings.defaultContext = v;
                await this.plugin.saveSettings();
              });
            });
          },
        },
      ],
    };
  }

  private templatesGroup(): SettingDefinitionGroup {
    return {
      type: "group",
      heading: t("settings.templates.header"),
      items: [
        {
          name: t("settings.templates-folder.name"),
          desc: t("settings.templates-folder.desc"),
          render: (setting) => {
            setting.addText((tt) =>
              tt.setValue(this.plugin.settings.templatesFolder).onChange(async (v) => {
                this.plugin.settings.templatesFolder = v;
                await this.plugin.saveSettings();
              })
            );
          },
        },
        {
          name: t("settings.default-template.name"),
          desc: t("settings.default-template.desc"),
          render: (setting) => {
            setting.addText((tt) =>
              tt.setValue(this.plugin.settings.defaultTemplate).onChange(async (v) => {
                this.plugin.settings.defaultTemplate = v;
                await this.plugin.saveSettings();
              })
            );
          },
        },
        {
          name: t("settings.open-templates-folder.button"),
          desc: "",
          render: (setting) => {
            setting.setName("").setDesc("");
            setting.addButton((b) =>
              b.setButtonText(t("settings.open-templates-folder.button")).onClick(() => {
                void this.plugin.openTemplatesFolder();
              })
            );
          },
        },
        {
          name: t("settings.restore-starter.name"),
          desc: t("settings.restore-starter.desc"),
          render: (setting) => {
            setting.addButton((b) =>
              b.setButtonText(t("settings.restore-starter.button")).onClick(async () => {
                await this.plugin.templates.ensureStarter();
                new Notice(t("settings.restore-starter.notice"));
              })
            );
          },
        },
        {
          name: t("settings.update-starter.name"),
          desc: t("settings.update-starter.desc"),
          render: (setting) => {
            setting.addButton((b) => {
              b.setButtonText(t("settings.update-starter.button")).onClick(async () => {
                await this.plugin.templates.forceWriteStarter();
                new Notice(t("settings.update-starter.notice"));
              });
              if (requireApiVersion("1.13.0")) {
                b.setDestructive();
              } else {
                // Same visual as the deprecated setWarning() without calling it.
                b.buttonEl.addClass("mod-warning");
              }
            });
          },
        },
      ],
    };
  }

  private uiGroup(): SettingDefinitionGroup {
    return {
      type: "group",
      heading: t("settings.ui.header"),
      items: [
        {
          name: t("settings.status-bar.name"),
          desc: t("settings.status-bar.desc"),
          render: (setting) => {
            setting.addToggle((tt) =>
              tt.setValue(this.plugin.settings.showStatusBar).onChange(async (v) => {
                this.plugin.settings.showStatusBar = v;
                await this.plugin.saveSettings();
              })
            );
          },
        },
        {
          name: t("settings.show-cost.name"),
          desc: t("settings.show-cost.desc"),
          render: (setting) => {
            setting.addToggle((tt) =>
              tt.setValue(this.plugin.settings.showCostInPreview).onChange(async (v) => {
                this.plugin.settings.showCostInPreview = v;
                await this.plugin.saveSettings();
              })
            );
          },
        },
      ],
    };
  }
}
