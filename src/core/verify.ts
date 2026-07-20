import type { LlmResponse, PromptInput, TransformContext, VerificationResult } from "../types";

/**
 * Completeness verify→repair chain (docs/specs/completeness-verify-chain.md).
 *
 * Stage 2 of the transform chain: audits the transform output against the raw
 * memo (and, when present, the transcript's key facts), then runs at most ONE
 * repair call reinserting whatever the audit listed as missing. Fail-open by
 * design — every failure path keeps the original transform output and reports
 * `verify-failed`; nothing here may throw past `runVerifyChain`.
 *
 * The [!git] skip decision is transform.ts's (the chain is never entered);
 * this module only knows memo/context/transcript.
 */

type GenerateFn = (input: PromptInput) => Promise<LlmResponse>;

/** Removes a single wrapping code fence (``` or ```lang) and trims. */
export function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return match ? match[1].trim() : trimmed;
}

/**
 * Parses the verify call's reply. Contract: exactly one JSON object
 * `{"missing": string[]}`. Anything else — non-JSON, wrong shape, non-string
 * entries — is a parse failure (`null`), which the chain maps to
 * `verify-failed` without repairing (never repair on garbage).
 */
export function parseVerifyResponse(text: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFences(text));
  } catch {
    return null;
  }
  const missing = (parsed as { missing?: unknown } | null)?.missing;
  if (!Array.isArray(missing) || !missing.every((m) => typeof m === "string")) return null;
  return missing;
}

/**
 * Audit prompt. The judgment set implements the contract's 누락 판정 대상:
 * every fact in the raw memo, plus — transcript notes only — figures, names,
 * dates, and decisions, inheriting the transform rules' memo-wins, small-talk
 * exclusion, no-guessing, and speaker-label distrust.
 */
export function buildVerifyPrompt(ctx: TransformContext, outputText: string): PromptInput {
  const sections: string[] = [label("RAW MEMO"), ctx.rawBody];
  if (ctx.perNoteContext && ctx.perNoteContext.trim()) {
    sections.push(label("NOTE-SPECIFIC CONTEXT"), ctx.perNoteContext.trim());
  }
  if (ctx.transcript && ctx.transcript.trim()) {
    sections.push(label("MEETING TRANSCRIPT (STT)"), ctx.transcript.trim());
  }
  sections.push(label("TRANSFORMED NOTE"), outputText);

  const rules = [
    "You are auditing the TRANSFORMED NOTE for completeness against its sources. List every fact that is missing from it.",
    "From the RAW MEMO, every distinct fact, statement, name, number, date, and decision must appear in the note.",
  ];
  if (ctx.transcript && ctx.transcript.trim()) {
    rules.push(
      "From the MEETING TRANSCRIPT, only figures, names, dates, and decisions count as missing — never speaker attribution (STT speaker labels are unreliable), and never small talk, garbled passages, or transcript-only filler. When the memo and the transcript conflict, the memo wins. Do not guess about garbled passages."
    );
  }
  rules.push(
    "Each entry in the list must be a self-contained statement carrying the source fact verbatim or near-verbatim, so it can be reinserted without consulting the sources again.",
    'Reply with exactly one JSON object and nothing else: {"missing": ["...", ...]}. If nothing is missing, reply {"missing": []}. No code fences, no commentary.'
  );
  sections.push(label("TASK"), rules.join("\n"));

  return { system: "", user: sections.join("\n\n") };
}

/**
 * Repair prompt. Carries the raw memo alongside the missing list so the
 * repair never has to invent — the memo is the authoritative source the
 * entries quote from.
 */
export function buildRepairPrompt(
  ctx: TransformContext,
  outputText: string,
  missing: string[]
): PromptInput {
  const sections: string[] = [
    label("RAW MEMO"),
    ctx.rawBody,
    label("TRANSFORMED NOTE"),
    outputText,
    label("MISSING FACTS"),
    missing.map((m) => `- ${m}`).join("\n"),
    label("TASK"),
    [
      "Insert each MISSING FACT into the most appropriate section of the TRANSFORMED NOTE.",
      "Change nothing else: do not drop, rephrase, or reorder existing content. Do not invent facts beyond the listed ones and the RAW MEMO.",
      "Keep the note's language and structure. Reply with the complete revised note in Markdown only. No code fences.",
    ].join("\n"),
  ];
  return { system: "", user: sections.join("\n\n") };
}

/**
 * Runs verify → conditional repair. Mutates `response` in place: usage fields
 * aggregate across the chain's calls, and `text` is replaced only on a valid
 * repair. Returns the chain outcome for the preview badge.
 */
export async function runVerifyChain(
  generate: GenerateFn,
  ctx: TransformContext,
  response: LlmResponse
): Promise<VerificationResult> {
  let verifyRes: LlmResponse;
  try {
    verifyRes = await generate(buildVerifyPrompt(ctx, response.text));
  } catch {
    return { status: "verify-failed" };
  }
  addUsage(response, verifyRes);

  const missing = parseVerifyResponse(verifyRes.text);
  if (missing === null) return { status: "verify-failed" };
  if (missing.length === 0) return { status: "verified" };

  let repairRes: LlmResponse;
  try {
    repairRes = await generate(buildRepairPrompt(ctx, response.text, missing));
  } catch {
    return { status: "verify-failed" };
  }
  addUsage(response, repairRes);

  const repaired = stripFences(repairRes.text);
  if (!repaired) return { status: "verify-failed" };

  response.text = repaired;
  return { status: "repaired", repairedCount: missing.length };
}

function addUsage(into: LlmResponse, from: LlmResponse): void {
  if (from.inputTokens !== undefined) into.inputTokens = (into.inputTokens ?? 0) + from.inputTokens;
  if (from.outputTokens !== undefined)
    into.outputTokens = (into.outputTokens ?? 0) + from.outputTokens;
  if (from.costUsd !== undefined) into.costUsd = (into.costUsd ?? 0) + from.costUsd;
}

function label(s: string): string {
  return `=== ${s} ===`;
}
