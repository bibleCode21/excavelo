import { App, MarkdownRenderer, Modal, Setting, setTooltip } from "obsidian";
import type ExcaveloPlugin from "../main";
import type { LlmResponse, Template, TransformContext } from "../types";
import { t } from "../i18n";

export type PreviewAction =
  | "append"
  | "save-as-new"
  | "replace"
  | "copy"
  | "regenerate"
  | "discard";

export interface PreviewActionContext {
  savePath: string;
}

/**
 * Shows the transformed output and lets the user choose what to do with it.
 * Per-template `output` field determines which button is the highlighted default.
 */
export class PreviewModal extends Modal {
  constructor(
    app: App,
    private plugin: ExcaveloPlugin,
    private template: Template,
    private response: LlmResponse,
    private transformContext: TransformContext,
    private suggestedSavePath: string,
    private onAction: (action: PreviewAction, ctx: PreviewActionContext) => void
  ) {
    super(app);
    this.modalEl.addClass("excavelo-preview-modal");
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: t("preview.title", { template: this.template.name }) });

    const bodyEl = contentEl.createDiv({ cls: "preview-body" });
    void MarkdownRenderer.render(
      this.app,
      this.response.text,
      bodyEl,
      "",
      this.plugin
    );

    new Setting(contentEl)
      .setName(t("preview.save-to-name"))
      .setDesc(t("preview.save-to-desc"))
      .addText((tt) => {
        tt.setValue(this.suggestedSavePath).onChange((v) => {
          this.suggestedSavePath = v;
        });
      });

    if (this.plugin.settings.showCostInPreview) {
      const meta = [];
      if (this.response.modelUsed) meta.push(`model: ${this.response.modelUsed}`);
      if (this.response.inputTokens !== undefined)
        meta.push(`in: ${this.response.inputTokens}`);
      if (this.response.outputTokens !== undefined)
        meta.push(`out: ${this.response.outputTokens}`);
      if (this.response.costUsd !== undefined)
        meta.push(`$${this.response.costUsd.toFixed(4)}`);
      if (meta.length > 0) {
        contentEl.createDiv({ cls: "preview-meta", text: meta.join("  |  ") });
      }
    }

    const footer = contentEl.createDiv({ cls: "preview-footer" });
    const defaultAction = this.defaultActionForTemplate();

    this.button(footer, t("preview.action.regenerate"), () => this.complete("regenerate"), {
      tooltip: t("preview.tooltip.regenerate"),
    });
    this.button(footer, t("preview.action.append"), () => this.complete("append"), {
      cta: defaultAction === "append",
      tooltip: t("preview.tooltip.append"),
    });
    this.button(footer, t("preview.action.save-as-new"), () => this.complete("save-as-new"), {
      cta: defaultAction === "save-as-new",
      tooltip: t("preview.tooltip.save-as-new"),
    });
    this.button(footer, t("preview.action.replace"), () => this.complete("replace"), {
      tooltip: t("preview.tooltip.replace"),
    });
    this.button(footer, t("preview.action.copy"), () => this.complete("copy"), {
      tooltip: t("preview.tooltip.copy"),
    });
    this.button(footer, t("preview.action.discard"), () => this.complete("discard"), {
      tooltip: t("preview.tooltip.discard"),
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private defaultActionForTemplate(): PreviewAction {
    switch (this.template.output) {
      case "append":
        return "append";
      case "new-file":
        return "save-as-new";
      default:
        return "save-as-new";
    }
  }

  private button(
    parent: HTMLElement,
    label: string,
    onClick: () => void,
    opts: { cta?: boolean; tooltip?: string } = {}
  ): void {
    const btn = parent.createEl("button", { text: label });
    if (opts.cta) btn.addClass("mod-cta");
    if (opts.tooltip) setTooltip(btn, opts.tooltip);
    btn.addEventListener("click", onClick);
  }

  private complete(action: PreviewAction): void {
    const ctx: PreviewActionContext = { savePath: this.suggestedSavePath };
    this.close();
    this.onAction(action, ctx);
  }
}
