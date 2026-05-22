import { App, Modal, Notice, Setting } from "obsidian";
import type ExcaveloPlugin from "../main";
import { ClaudeCodeCliProvider } from "../llm/claude-code-cli";

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
    contentEl.createEl("h2", { text: "excaVelo setup" });
    contentEl.createEl("p", {
      text: "Choose how the plugin should talk to Claude. You can change this later in settings.",
    });

    new Setting(contentEl)
      .setName("Use Claude Code (recommended)")
      .setDesc(
        "If you already have Claude Code installed and signed in, the plugin will use it. " +
          "Works with Claude Pro/Max subscriptions and team accounts. Desktop only."
      )
      .addButton((b) =>
        b
          .setButtonText("Detect Claude Code")
          .setCta()
          .onClick(async () => {
            await this.runDetect();
          })
      );

    this.statusEl = contentEl.createDiv({ cls: "excavelo-onboarding-status" });

    new Setting(contentEl)
      .setName("Use Anthropic API key")
      .setDesc(
        "Get a key at console.anthropic.com. Pay-per-token billing, separate from any Claude.ai subscription."
      )
      .addButton((b) =>
        b.setButtonText("Use API key").onClick(async () => {
          this.plugin.settings.authMethod = "anthropic-api";
          this.plugin.settings.hasCompletedOnboarding = true;
          await this.plugin.saveSettings();
          new Notice("Open settings to paste your Anthropic API key.");
          this.close();
        })
      );

    new Setting(contentEl).addButton((b) =>
      b.setButtonText("Skip for now").onClick(async () => {
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
    this.setStatus("Detecting...");
    const hint = this.plugin.settings.claudeCodeCli.binaryPath;
    const detected = await ClaudeCodeCliProvider.detect(hint);
    if (!detected.found) {
      this.setStatus(
        "Claude Code not found. Install it from claude.ai/code, or set the binary path in settings."
      );
      return;
    }
    this.plugin.settings.authMethod = "claude-code-cli";
    if (detected.path) this.plugin.settings.claudeCodeCli.binaryPath = detected.path;
    this.plugin.settings.hasCompletedOnboarding = true;
    await this.plugin.saveSettings();
    new Notice(`Claude Code detected (version ${detected.version ?? "unknown"}).`);
    this.close();
  }

  private setStatus(text: string): void {
    if (!this.statusEl) return;
    this.statusEl.setText(text);
  }
}
