import { App, Modal, Notice, Setting } from "obsidian";
import type ExcaveloPlugin from "../main";
import { ClaudeCodeCliProvider } from "../llm/claude-code-cli";
import { t } from "../i18n";

/**
 * One-time setup wizard shown on first activation. Auto-detects Claude Code and
 * defaults to the CLI path when found.
 */
export class OnboardingModal extends Modal {
  private statusEl: HTMLElement | null = null;

  constructor(app: App, private plugin: ExcaveloPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: t("onboarding.title") });
    contentEl.createEl("p", {
      text: t("onboarding.intro"),
    });

    new Setting(contentEl)
      .setName(t("onboarding.cli.name"))
      .setDesc(t("onboarding.cli.desc"))
      .addButton((b) =>
        b
          .setButtonText(t("onboarding.cli.button"))
          .setCta()
          .onClick(async () => {
            await this.runDetect();
          })
      );

    this.statusEl = contentEl.createDiv({ cls: "excavelo-onboarding-status" });

    new Setting(contentEl)
      .setName(t("onboarding.api.name"))
      .setDesc(t("onboarding.api.desc"))
      .addButton((b) =>
        b.setButtonText(t("onboarding.api.button")).onClick(async () => {
          this.plugin.settings.authMethod = "anthropic-api";
          this.plugin.settings.hasCompletedOnboarding = true;
          await this.plugin.saveSettings();
          new Notice(t("onboarding.api.notice"));
          this.close();
        })
      );

    new Setting(contentEl).addButton((b) =>
      b.setButtonText(t("onboarding.skip")).onClick(async () => {
        this.plugin.settings.hasCompletedOnboarding = true;
        await this.plugin.saveSettings();
        this.close();
      })
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async runDetect(): Promise<void> {
    this.setStatus(t("onboarding.cli.detecting"));
    const hint = this.plugin.settings.claudeCodeCli.binaryPath;
    const detected = await ClaudeCodeCliProvider.detect(hint);
    if (!detected.found) {
      this.setStatus(t("onboarding.cli.not-found"));
      return;
    }
    this.plugin.settings.authMethod = "claude-code-cli";
    if (detected.path) this.plugin.settings.claudeCodeCli.binaryPath = detected.path;
    this.plugin.settings.hasCompletedOnboarding = true;
    await this.plugin.saveSettings();
    new Notice(t("onboarding.cli.detected", { version: detected.version ?? "unknown" }));
    this.close();
  }

  private setStatus(text: string): void {
    if (!this.statusEl) return;
    this.statusEl.setText(text);
  }
}
