import type { Template, WikiConfig, WikiTemplateMapping } from "../types";

/**
 * Resolves the destination path and frontmatter preset for a transform output,
 * given the active wiki config and the template being applied.
 *
 * Falls back to the template's own output settings when wiki mode is off or
 * when the wiki config has no mapping for this template.
 */
export interface ResolvedOutput {
  savePath: string;
  filename: string;
  frontmatterPreset: Record<string, unknown> | null;
}

export function resolveWikiOutput(
  wiki: WikiConfig | null,
  template: Template,
  slug: string,
  isoDate: string
): ResolvedOutput {
  const mapping: WikiTemplateMapping | undefined = wiki?.templateMapping[template.name];

  const savePath =
    mapping?.savePath ??
    template.outputFolder ??
    wiki?.sourcesPath ??
    "";

  const pattern =
    mapping?.filenamePattern ??
    template.outputFilename ??
    "{date}-{slug}";

  const filename = pattern
    .replace(/\{date\}/g, isoDate)
    .replace(/\{slug\}/g, slug)
    .replace(/\{template\}/g, template.name);

  return {
    savePath,
    filename,
    frontmatterPreset: mapping?.frontmatterPreset ?? null,
  };
}
