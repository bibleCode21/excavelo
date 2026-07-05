import type { Editor } from "obsidian";

/**
 * Extracts plugin callouts from the active note.
 *
 * `[!context]` — per-note context; the collected text goes into the prompt.
 * `[!stt]` — links to speech-to-text transcript files; the plugin reads the
 * linked files and feeds them to the LLM alongside the memo.
 * `[!git]` — local repository specs (path + optional since:/until:); the
 * plugin runs `git log` there and feeds the result to the LLM (desktop only).
 * Recognized forms:
 *
 *   > [!context]
 *   > line one
 *
 *   > [!stt] [[2026-07-04 meeting recording]]
 *
 *   > [!stt]
 *   > [[transcript part 1]]
 *   > [[transcript part 2]]
 *
 *   > [!git] D:/git/excavelo since:2026-07-01 until:2026-07-05
 *
 *   > [!git] C:/git/repo-a
 *   > C:/git/repo-b
 *
 * Branch names pasted into the memo body are looked up in the [!git]
 * repositories automatically (see core/git-log.ts).
 *
 * Callouts may appear anywhere in the body. The first [!context] is honored;
 * every [!stt] contributes links and every [!git] contributes one spec per
 * non-empty line. Lines outside the callouts become the raw memo passed to
 * the LLM.
 */
export function extractContext(noteText: string): {
  perNoteContext: string | null;
  rawBody: string;
  sttLinks: string[];
  hasSttCallout: boolean;
  gitSpecs: string[];
  hasGitCallout: boolean;
} {
  const lines = noteText.split(/\r?\n/);
  let i = 0;
  let perNoteContext: string | null = null;
  const sttLinks: string[] = [];
  let hasSttCallout = false;
  const gitSpecs: string[] = [];
  let hasGitCallout = false;
  const remaining: string[] = [];

  const collectCallout = (tag: string): string => {
    const collected: string[] = [];
    const titleMatch = lines[i].match(new RegExp(`^>\\s*\\[!${tag}\\](.*)$`, "i"));
    const titleText = (titleMatch?.[1] ?? "").trim();
    if (titleText) collected.push(titleText);
    i++;
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      collected.push(lines[i].replace(/^>\s?/, ""));
      i++;
    }
    return collected.join("\n").trim();
  };

  while (i < lines.length) {
    const line = lines[i];
    if (perNoteContext === null && /^>\s*\[!context\]/i.test(line)) {
      perNoteContext = collectCallout("context");
      continue;
    }
    if (/^>\s*\[!stt\]/i.test(line)) {
      hasSttCallout = true;
      sttLinks.push(...extractWikilinks(collectCallout("stt")));
      continue;
    }
    if (/^>\s*\[!git\]/i.test(line)) {
      hasGitCallout = true;
      gitSpecs.push(
        ...collectCallout("git")
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
      );
      continue;
    }
    remaining.push(line);
    i++;
  }

  return {
    perNoteContext,
    rawBody: remaining.join("\n").trim(),
    sttLinks,
    hasSttCallout,
    gitSpecs,
    hasGitCallout,
  };
}

/** [[path]], [[path|alias]], [[path#heading]] -> path */
function extractWikilinks(text: string): string[] {
  const links: string[] = [];
  for (const m of text.matchAll(/\[\[([^\]]+?)\]\]/g)) {
    const target = m[1].split("|")[0].split("#")[0].trim();
    if (target) links.push(target);
  }
  return links;
}

export function getNoteText(editor: Editor): string {
  const selection = editor.getSelection();
  if (selection && selection.trim().length > 0) return selection;
  return editor.getValue();
}
