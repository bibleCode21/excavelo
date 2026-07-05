import { App, FuzzySuggestModal } from "obsidian";
import type { Template } from "../types";
import { currentLocale, t } from "../i18n";

/**
 * Template chooser. Shown when the user invokes "Transform note..." without
 * a pre-selected template. The default template (per settings) is highlighted
 * at the top of the list.
 */
export type ChooserMode = "transform" | "new-note";

export class ChooserModal extends FuzzySuggestModal<Template> {
  constructor(
    app: App,
    private templates: Template[],
    private defaultName: string,
    private onChoose: (t: Template) => void,
    mode: ChooserMode = "transform"
  ) {
    super(app);
    this.setPlaceholder(
      mode === "transform"
        ? t("chooser.placeholder.transform")
        : t("chooser.placeholder.new-note")
    );
    this.modalEl.addClass("excavelo-chooser-modal");
  }

  getItems(): Template[] {
    const sorted = [...this.templates].sort((a, b) => {
      if (a.name === this.defaultName) return -1;
      if (b.name === this.defaultName) return 1;
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }

  getItemText(item: Template): string {
    const suffix = item.name === this.defaultName ? `  ${t("chooser.default-suffix")}` : "";
    const desc =
      currentLocale() === "ko" && item.descriptionKo ? item.descriptionKo : item.description;
    return `${item.name}${suffix} — ${desc}`;
  }

  onChooseItem(item: Template): void {
    this.onChoose(item);
  }
}
