import type { PromptInput, TransformContext } from "../types";

/**
 * Assembles the final prompt as a structured {system, user} pair.
 *
 * - `system` carries the always-on USER CONTEXT block. It is stable across
 *   transforms with the same `defaultContext`, so providers that support
 *   prompt caching can mark it as cacheable to cut input-token cost.
 * - `user` carries everything that varies per transform: note-specific
 *   context, raw memo, the chosen template's task instruction, and the
 *   output rules.
 *
 * The exact section labels are stable so users can reason about what the LLM
 * sees. Changing them is a breaking change for any provider that depends on
 * marker positions.
 */
export function buildPrompt(ctx: TransformContext): PromptInput {
  const system = ctx.defaultContext.trim()
    ? `${label("USER CONTEXT (always-on)")}\n${ctx.defaultContext.trim()}`
    : "";

  const userSections: string[] = [];

  if (ctx.perNoteContext && ctx.perNoteContext.trim()) {
    userSections.push(label("NOTE-SPECIFIC CONTEXT"), ctx.perNoteContext.trim());
  }

  userSections.push(label("RAW MEMO"), ctx.rawBody);
  userSections.push(label("TASK"), ctx.template.instruction);

  // The output contract below implements the fidelity policy in docs/prd.md.
  // Preservation-first: templates define structure, this defines what may
  // never be lost. Wording changes here change every transform — treat as API.
  const rules = [
    "Reply with the transformed note in Markdown only.",
    "Do not wrap your reply in code fences.",
    "Write the entire output, including section headings, in the language of the raw memo.",
    "Completeness: every distinct fact, statement, name, number, date, and decision in the raw memo must appear in the output. Restructure and deduplicate freely, but never drop content. When unsure whether something matters, include it.",
    "Output length scales with input length. Do not compress for brevity unless the TASK explicitly asks for summarization.",
    "Do not reproduce the raw memo verbatim as one block; reorganize it into the requested structure.",
    "Do not invent facts. Inference belongs only in sections the TASK explicitly labels as interpretation.",
  ];
  userSections.push(label("OUTPUT RULES"), rules.join("\n"));

  return { system, user: userSections.join("\n\n") };
}

function label(s: string): string {
  return `=== ${s} ===`;
}
