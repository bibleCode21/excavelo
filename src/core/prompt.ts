import type { PromptInput, TransformContext } from "../types";
import { label } from "./prompt-format";

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

  if (ctx.transcript && ctx.transcript.trim()) {
    userSections.push(label("MEETING TRANSCRIPT (STT)"), ctx.transcript.trim());
  }

  if (ctx.gitLog && ctx.gitLog.trim()) {
    userSections.push(label("GIT LOG"), ctx.gitLog.trim());
  }

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
  if (ctx.transcript && ctx.transcript.trim()) {
    rules.push(
      "The RAW MEMO is the author's authoritative record. The MEETING TRANSCRIPT is automatic speech-to-text of the same meeting: it may contain recognition errors, wrong speaker attribution, and filler talk.",
      "Use the transcript to recover details, figures, names, and decisions the memo omits. When the memo and the transcript conflict, the memo wins.",
      "Ignore transcript passages that are small talk or clearly off-topic.",
      "If a transcript passage is too garbled to interpret reliably, do not guess: mark the affected item with a note meaning 'STT damaged segment' in the output language (in Korean: '(STT 손상 구간)')."
    );
  }
  if (ctx.gitLog && ctx.gitLog.trim()) {
    rules.push(
      "The GIT LOG is the factual record of code changes in the named repositories. Treat commit messages and diffstats as ground truth for what was done; do not invent work that is not in the log or the memo.",
      "The GIT LOG groups commits into sections, and every section in it is work that reached the repository's default branch — it shipped. A '--- landed <date>' section carries that landing's commits, and the date on that header is when it shipped. A '--- confirmed landed on <base> branch: <name>' section names a branch proven to have reached the base; it lists that branch's commit subjects when it carries any, and when it carries no lines at all its commits either appear among the '--- landed' sections instead or are not in this log at all — narrowing the window never removes the branch's name, only whether its commits are shown alongside it. A '(landed <date>)' suffix on that header names the one landing that confirmed the branch; its absence means only ancestry proved it, with no single landing to date.",
      "Work that has not reached the default branch is not in the GIT LOG at all. Never report anything from it as in progress, pending, or not yet shipped.",
      "Group and describe the work by intent (feature, fix, refactor), not commit-by-commit; merge related commits into one line of substance.",
      "When the TASK selects work from the GIT LOG using items in the raw memo (such as an issue list), those memo items are selection criteria, not content to preserve: an item with no matching work in the log produces no entry, and must never be given an invented date or description. For such items this overrides the completeness rule above.",
      "Match memo items to commits by what the commits actually say. Do not reinterpret or reframe a commit to force a match; when a commit matches no item as written, leave it out."
    );
  }
  userSections.push(label("OUTPUT RULES"), rules.join("\n"));

  return { system, user: userSections.join("\n\n") };
}
