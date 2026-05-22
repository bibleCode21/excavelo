import { App, normalizePath } from "obsidian";
import type { WikiConfig } from "../types";

const CONFIG_FILE = "excavelo.json";

/**
 * Detects whether the current vault is opting into "wiki mode" by checking for
 * `excavelo.json` at vault root. Returns null when not in wiki mode.
 */
export async function detectWikiConfig(app: App): Promise<WikiConfig | null> {
  const file = app.vault.getAbstractFileByPath(normalizePath(CONFIG_FILE));
  if (!file || !("path" in file)) return null;
  try {
    const raw = await app.vault.adapter.read(CONFIG_FILE);
    const parsed = JSON.parse(raw) as Partial<WikiConfig>;
    if (!parsed.wikiMode) return null;
    return {
      wikiMode: true,
      rawRoot: parsed.rawRoot ?? "raw",
      wikiRoot: parsed.wikiRoot ?? "wiki",
      sourcesPath: parsed.sourcesPath ?? "wiki/sources",
      contextFromClaudeMd: parsed.contextFromClaudeMd ?? false,
      templateMapping: parsed.templateMapping ?? {},
    };
  } catch {
    return null;
  }
}
