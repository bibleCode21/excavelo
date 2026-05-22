import type { Editor } from "obsidian";

/**
 * Extracts the per-note context from a `[!context]` callout in the active note.
 * Returns null when no callout is present.
 *
 * Recognized forms:
 *
 *   > [!context]
 *   > line one
 *   > line two
 *
 *   > [!context] title text
 *   > body
 *
 * The callout may appear anywhere in the body; only the first one is honored.
 * The lines outside the callout become the raw memo passed to the LLM.
 */
export function extractContext(noteText: string): {
  perNoteContext: string | null;
  rawBody: string;
} {
  const lines = noteText.split(/\r?\n/);
  let i = 0;
  let perNoteContext: string | null = null;
  const remaining: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    if (perNoteContext === null && /^>\s*\[!context\]/i.test(line)) {
      const collected: string[] = [];
      const titleMatch = line.match(/^>\s*\[!context\](.*)$/i);
      const titleText = (titleMatch?.[1] ?? "").trim();
      if (titleText) collected.push(titleText);
      i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        collected.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      perNoteContext = collected.join("\n").trim();
      continue;
    }
    remaining.push(line);
    i++;
  }

  return {
    perNoteContext,
    rawBody: remaining.join("\n").trim(),
  };
}

export function getNoteText(editor: Editor): string {
  const selection = editor.getSelection();
  if (selection && selection.trim().length > 0) return selection;
  return editor.getValue();
}
