import { App, FuzzySuggestModal } from "obsidian";
import type { Template } from "../types";

/**
 * Template chooser. Shown when the user invokes "Transform note..." without
 * a pre-selected template. The default template (per settings) is highlighted
 * at the top of the list.
 */
export class ChooserModal extends FuzzySuggestModal<Template> {
  constructor(
    app: App,
    private templates: Template[],
    private defaultName: string,
    private onChoose: (t: Template) => void
  ) {
    super(app);
    this.setPlaceholder("Choose a template to transform with");
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

  getItemText(t: Template): string {
    const suffix = t.name === this.defaultName ? "  (default)" : "";
    return `${t.name}${suffix} — ${t.description}`;
  }

  onChooseItem(t: Template): void {
    this.onChoose(t);
  }
}
