import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { Template } from "../types";
import { STARTER_TEMPLATES } from "./starter-templates";

/**
 * Scans the configured templates folder for *.md files. Each file's frontmatter
 * (parsed via Obsidian's metadata cache) becomes the Template's metadata; the
 * body (after frontmatter) becomes the instruction prompt for the LLM.
 *
 * On first run, copies bundled starter templates from `starter-templates/` into
 * the vault folder if it is empty.
 */
export class TemplateRegistry {
  constructor(private app: App, private folderPath: string) {}

  async list(): Promise<Template[]> {
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(this.folderPath));
    if (!(folder instanceof TFolder)) return [];

    const templates: Template[] = [];
    for (const child of folder.children) {
      if (child instanceof TFile && child.extension === "md") {
        const parsed = await this.parse(child);
        if (parsed) templates.push(parsed);
      }
    }
    return templates;
  }

  async findByName(name: string): Promise<Template | null> {
    const all = await this.list();
    return all.find((t) => t.name === name) ?? null;
  }

  /**
   * Copies the bundled starter templates into the configured folder on first
   * run, only if that folder is empty (or doesn't exist yet). Existing user
   * templates are never overwritten.
   */
  async ensureStarter(): Promise<void> {
    const folderPath = normalizePath(this.folderPath);
    let folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      try {
        await this.app.vault.createFolder(folderPath);
      } catch {
        // Folder may have been created by another process in the meantime.
      }
      folder = this.app.vault.getAbstractFileByPath(folderPath);
    }
    if (!(folder instanceof TFolder)) return;

    const existingNames = new Set(folder.children.map((c) => c.name));
    const hasAnyMarkdown = folder.children.some(
      (c) => c instanceof TFile && c.extension === "md"
    );
    if (hasAnyMarkdown) return;

    for (const starter of STARTER_TEMPLATES) {
      if (existingNames.has(starter.filename)) continue;
      const targetPath = normalizePath(`${folderPath}/${starter.filename}`);
      try {
        await this.app.vault.create(targetPath, starter.content);
      } catch {
        // Race or file-already-exists — leave the user's copy alone.
      }
    }
  }

  private async parse(file: TFile): Promise<Template | null> {
    const raw = await this.app.vault.read(file);
    const { frontmatter, body } = splitFrontmatter(raw);
    if (!frontmatter) return null;
    const name = String(frontmatter.name ?? file.basename);
    return {
      name,
      description: String(frontmatter.description ?? ""),
      icon: frontmatter.icon ? String(frontmatter.icon) : undefined,
      hotkey: (frontmatter.hotkey as string | null | undefined) ?? null,
      provider: (frontmatter.provider as never) ?? null,
      output: (frontmatter.output as never) ?? "preview-first",
      outputFolder: frontmatter.output_folder
        ? String(frontmatter.output_folder)
        : undefined,
      outputFilename: frontmatter.output_filename
        ? String(frontmatter.output_filename)
        : undefined,
      instruction: stripFirstHeading(body).trim(),
      filePath: file.path,
    };
  }
}

interface FrontmatterParsed {
  frontmatter: Record<string, unknown> | null;
  body: string;
}

/**
 * Naive YAML frontmatter splitter. Good enough for the simple key:value templates
 * we ship. For richer parsing, swap to obsidian's metadataCache.getFileCache().
 */
function splitFrontmatter(raw: string): FrontmatterParsed {
  if (!raw.startsWith("---\n")) return { frontmatter: null, body: raw };
  const end = raw.indexOf("\n---", 4);
  if (end < 0) return { frontmatter: null, body: raw };
  const yaml = raw.slice(4, end);
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const frontmatter: Record<string, unknown> = {};
  for (const line of yaml.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    frontmatter[key] = parseYamlScalar(value);
  }
  return { frontmatter, body };
}

function parseYamlScalar(v: string): unknown {
  const trimmed = v.trim();
  if (trimmed === "" || trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function stripFirstHeading(body: string): string {
  // Templates begin with "# Instruction" by convention; LLM doesn't need the heading.
  return body.replace(/^\s*#\s+Instruction\s*\n+/i, "");
}
