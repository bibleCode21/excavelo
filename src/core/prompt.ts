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
  userSections.push(
    label("OUTPUT RULES"),
    [
      "Reply with the transformed note in Markdown only.",
      "Do not wrap your reply in code fences.",
      "Do not echo the raw memo back.",
      "Match the language of the raw memo.",
    ].join("\n")
  );

  return { system, user: userSections.join("\n\n") };
}

function label(s: string): string {
  return `=== ${s} ===`;
}
