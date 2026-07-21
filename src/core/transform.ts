import { Editor, Notice } from "obsidian";
import type ExcaveloPlugin from "../main";
import type { LlmProvider } from "../llm/llm";
import type { LlmResponse, Template, TransformContext, VerificationResult } from "../types";
import { extractContext, getNoteText } from "./context";
import { buildPrompt } from "./prompt";
import { loadGitLog } from "./git-log";
import { runVerifyChain } from "./verify";
import { t } from "../i18n";

/**
 * Orchestrates a single transform: pull context + raw memo from the editor,
 * build the prompt, call the LLM, then run the verify→repair completeness
 * chain (≤2 extra calls) when enabled. The caller is responsible for showing
 * the preview modal and committing the output.
 */
export class TransformRunner {
  constructor(private plugin: ExcaveloPlugin) {}

  async run(editor: Editor, template: Template): Promise<{
    response: LlmResponse;
    transformContext: TransformContext;
    verification: VerificationResult | null;
  }> {
    const noteText = getNoteText(editor);
    if (!noteText.trim()) {
      throw new Error(t("transform.note-empty"));
    }

    const { perNoteContext, rawBody, sttLinks, hasSttCallout, gitSpecs, hasGitCallout } =
      extractContext(noteText);
    if (hasSttCallout && sttLinks.length === 0) {
      throw new Error(t("transform.stt-no-link"));
    }
    if (hasGitCallout && gitSpecs.length === 0) {
      throw new Error(t("git.no-path"));
    }
    const transcript = await this.loadTranscript(sttLinks);
    const gitLog = await loadGitLog(gitSpecs, rawBody);
    const transformContext: TransformContext = {
      defaultContext: this.plugin.settings.defaultContext,
      perNoteContext,
      rawBody,
      transcript,
      gitLog,
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
      // Verify→repair chain (docs/specs/completeness-verify-chain.md).
      // [!git] notes skip it: selection-criteria memo items would be
      // misjudged as misses and repaired into fabricated entries.
      // runVerifyChain mutates `response` in place — usage fields sum across
      // the chain's calls, and `text` is replaced on a valid repair.
      let verification: VerificationResult | null = null;
      if (this.plugin.settings.verifyCompleteness) {
        verification = gitLog
          ? { status: "skipped-git" }
          : await runVerifyChain(
              (input) =>
                provider.generate(input, template.model ? { model: template.model } : undefined),
              transformContext,
              response
            );
      }
      return { response, transformContext, verification };
    } catch (err) {
      new Notice(t("notice.error-generic", { detail: (err as Error).message }));
      throw err;
    } finally {
      this.plugin.setStatusBusy(false);
    }
  }

  /**
   * Reads the [!stt]-linked transcript files. A link that does not resolve is
   * an error, not a silent memo-only transform — the user attached it because
   * the memo alone is not the full record.
   */
  private async loadTranscript(links: string[]): Promise<string | null> {
    if (links.length === 0) return null;
    const app = this.plugin.app;
    const sourcePath = app.workspace.getActiveFile()?.path ?? "";
    const parts: string[] = [];
    for (const link of links) {
      const file = app.metadataCache.getFirstLinkpathDest(link, sourcePath);
      if (!file) {
        throw new Error(t("transform.stt-not-found", { name: link }));
      }
      const content = (await app.vault.read(file)).trim();
      parts.push(links.length > 1 ? `--- ${file.basename} ---\n${content}` : content);
    }
    return parts.join("\n\n");
  }

  // TODO: regenerate(), retry-on-error, streaming variant.
}

export type { LlmProvider };
