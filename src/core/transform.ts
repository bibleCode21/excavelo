import { Editor, Notice } from "obsidian";
import type ExcaveloPlugin from "../main";
import type { LlmProvider } from "../llm/llm";
import type { LlmResponse, Template, TransformContext } from "../types";
import { extractContext, getNoteText } from "./context";
import { buildPrompt } from "./prompt";
import { t } from "../i18n";

/**
 * Orchestrates a single transform: pull context + raw memo from the editor,
 * build the prompt, call the LLM, return the response. The caller is
 * responsible for showing the preview modal and committing the output.
 */
export class TransformRunner {
  constructor(private plugin: ExcaveloPlugin) {}

  async run(editor: Editor, template: Template): Promise<{
    response: LlmResponse;
    transformContext: TransformContext;
  }> {
    const noteText = getNoteText(editor);
    if (!noteText.trim()) {
      throw new Error(t("transform.note-empty"));
    }

    const { perNoteContext, rawBody } = extractContext(noteText);
    const transformContext: TransformContext = {
      defaultContext: this.plugin.settings.defaultContext,
      perNoteContext,
      rawBody,
      template,
      vaultRoot: this.plugin.vaultRoot(),
    };

    const promptInput = buildPrompt(transformContext);
    const provider = await this.plugin.resolveProvider(template);

    this.plugin.setStatusBusy(true);
    try {
      const response = await provider.generate(
        promptInput,
        template.model ? { model: template.model } : undefined
      );
      return { response, transformContext };
    } catch (err) {
      new Notice(t("notice.error-generic", { detail: (err as Error).message }));
      throw err;
    } finally {
      this.plugin.setStatusBusy(false);
    }
  }

  // TODO: regenerate(), retry-on-error, streaming variant.
}

export type { LlmProvider };
