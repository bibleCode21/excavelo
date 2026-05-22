import { App, MarkdownRenderer, Modal, Setting, setTooltip } from "obsidian";
import type ExcaveloPlugin from "../main";
import type { LlmResponse, Template, TransformContext } from "../types";

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
    contentEl.createEl("h3", { text: `Preview — ${this.template.name}` });

    const bodyEl = contentEl.createDiv({ cls: "preview-body" });
    void MarkdownRenderer.render(
      this.app,
      this.response.text,
      bodyEl,
      "",
      this.plugin
    );

    new Setting(contentEl)
      .setName("Save to")
      .setDesc("Used when 'Save as new' is chosen.")
      .addText((t) => {
        t.setValue(this.suggestedSavePath).onChange((v) => {
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

    this.button(footer, "Regenerate", () => this.complete("regenerate"), {
      tooltip: "Re-run the transform. LLM output is non-deterministic, so the new response will vary.",
    });
    this.button(footer, "Append to current", () => this.complete("append"), {
      cta: defaultAction === "append",
      tooltip: "Add the response below the current note. The raw memo stays in place.",
    });
    this.button(footer, "Save as new", () => this.complete("save-as-new"), {
      cta: defaultAction === "save-as-new",
      tooltip: "Write the response to the file path in the 'Save to' field above. The current note is not modified.",
    });
    this.button(footer, "Replace", () => this.complete("replace"), {
      tooltip: "Overwrite the current note with the response. Cmd+Z (or Ctrl+Z) undoes the replacement.",
    });
    this.button(footer, "Copy", () => this.complete("copy"), {
      tooltip: "Copy the response text to the system clipboard. No files change.",
    });
    this.button(footer, "Discard", () => this.complete("discard"), {
      tooltip: "Close without saving the response anywhere.",
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
