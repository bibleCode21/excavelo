import { Editor, MarkdownView, Menu, Notice, Platform, Plugin, TFile, TFolder, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS } from "./settings/settings";
import { ExcaveloSettingTab } from "./settings/settings-tab";
import { ChooserModal } from "./ui/chooser-modal";
import { PreviewModal, PreviewAction, PreviewActionContext } from "./ui/preview-modal";
import { OnboardingModal } from "./ui/onboarding-modal";
import { TemplateRegistry } from "./core/templates";
import { TransformRunner } from "./core/transform";
import { ClaudeCodeCliProvider } from "./llm/claude-code-cli";
import { AnthropicProvider } from "./llm/anthropic";
import { OpenAiCompatProvider } from "./llm/openai-compat";
import { detectWikiConfig } from "./wiki/detect";
import { resolveWikiOutput } from "./wiki/mapping";
import type { LlmProvider } from "./llm/llm";
import type { AuthMethod, PluginSettings, Template, WikiConfig } from "./types";
import { setLocaleOverride, t } from "./i18n";

export default class ExcaveloPlugin extends Plugin {
  settings!: PluginSettings;
  templates!: TemplateRegistry;
  private runner!: TransformRunner;
  private statusBarEl: HTMLElement | null = null;
  private wikiConfig: WikiConfig | null = null;
  private mobileFallbackNotified = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.templates = new TemplateRegistry(this.app, this.settings.templatesFolder);
    this.runner = new TransformRunner(this);

    this.addSettingTab(new ExcaveloSettingTab(this.app, this));

    this.addRibbonIcon("wand-2", t("ribbon.transform-note"), () => {
      void this.openChooser();
    });

    this.addCommand({
      id: "transform-note",
      name: t("command.transform-note"),
      editorCallback: () => void this.openChooser(),
    });

    this.addCommand({
      id: "transform-with-default",
      name: t("command.transform-default"),
      editorCallback: (editor) => void this.transformWithDefault(editor),
    });

    this.addCommand({
      id: "new-note-from-template",
      name: t("command.new-note-from-template"),
      callback: () => void this.openNewNoteChooser(),
    });

    this.addCommand({
      id: "open-templates-folder",
      name: t("command.open-templates-folder"),
      callback: () => void this.openTemplatesFolder(),
    });

    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu: Menu, _editor: Editor, view) => {
        if (!(view instanceof MarkdownView)) return;
        menu.addItem((item) => {
          item.setTitle(t("menu.transform-note"));
          item.setIcon("wand-2");
          item.onClick(() => void this.openChooser());
        });
      })
    );

    if (this.settings.showStatusBar) {
      this.statusBarEl = this.addStatusBarItem();
      this.statusBarEl.addClass("excavelo-status-bar");
      this.statusBarEl.setText(t("status.ready"));
      this.statusBarEl.onclick = () => this.openOwnSettings();
    }

    this.app.workspace.onLayoutReady(() => {
      void this.refreshWikiConfig();
      void this.templates.ensureStarter();
      if (!this.settings.hasCompletedOnboarding) {
        new OnboardingModal(this.app, this).open();
      }
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.name === "excavelo.json") {
          void this.refreshWikiConfig();
        }
      })
    );
  }

  onunload(): void {
    // Cleanup is handled by Obsidian for registered events / status bar items.
  }

  async loadSettings(): Promise<void> {
    // Merge nested sections individually: a data.json written before a new
    // per-provider field existed would otherwise blank out its default.
    const data = ((await this.loadData()) ?? {}) as Partial<PluginSettings>;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...data,
      claudeCodeCli: { ...DEFAULT_SETTINGS.claudeCodeCli, ...(data.claudeCodeCli ?? {}) },
      anthropicApi: { ...DEFAULT_SETTINGS.anthropicApi, ...(data.anthropicApi ?? {}) },
      openAiCompat: { ...DEFAULT_SETTINGS.openAiCompat, ...(data.openAiCompat ?? {}) },
    };
    setLocaleOverride(this.settings.language);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  vaultRoot(): string {
    // Obsidian's adapter knows the basePath on desktop; mobile returns "".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.app.vault.adapter as any).basePath ?? "";
  }

  setStatusBusy(busy: boolean): void {
    if (!this.statusBarEl) return;
    this.statusBarEl.toggleClass("is-busy", busy);
    this.statusBarEl.setText(busy ? t("status.thinking") : t("status.ready"));
  }

  async resolveProvider(template: Template): Promise<LlmProvider> {
    return this.providerFor(template.provider ?? this.settings.authMethod);
  }

  providerFor(method: AuthMethod): LlmProvider {
    // Mobile auto-fallback per HANDOFF.md §3: CLI is desktop-only, so on
    // mobile we transparently route claude-code-cli requests through the
    // Anthropic API key path. Surfaces a one-time Notice so the user knows.
    if (method === "claude-code-cli" && Platform.isMobile) {
      if (!this.settings.anthropicApi.apiKey) {
        throw new Error(
          "Claude Code CLI is desktop-only and no Anthropic API key is configured. " +
            "Open Settings > Connection and paste an Anthropic API key."
        );
      }
      if (!this.mobileFallbackNotified) {
        this.mobileFallbackNotified = true;
        new Notice(t("notice.mobile-fallback"));
      }
      return new AnthropicProvider(this.settings.anthropicApi);
    }
    switch (method) {
      case "claude-code-cli":
        return new ClaudeCodeCliProvider(this.settings.claudeCodeCli, this.vaultRoot());
      case "anthropic-api":
        return new AnthropicProvider(this.settings.anthropicApi);
      case "openai-compat":
        return new OpenAiCompatProvider(this.settings.openAiCompat);
      default:
        throw new Error(`Unknown auth method: ${method}`);
    }
  }

  async openTemplatesFolder(): Promise<void> {
    const folderPath = normalizePath(this.settings.templatesFolder);
    if (!this.app.vault.getAbstractFileByPath(folderPath)) {
      await this.app.vault.createFolder(folderPath).catch(() => {
        /* ignore "already exists" race */
      });
    }
    const vaultRoot = this.vaultRoot();
    if (!vaultRoot) {
      new Notice(t("notice.templates-folder-platform", { path: folderPath }));
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const electron = (window as any).require?.("electron") as { shell?: { openPath: (p: string) => Promise<string> } } | undefined;
      if (!electron?.shell) {
        new Notice(t("notice.templates-folder", { path: folderPath }));
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pathMod = (window as any).require?.("path") as { join: (...parts: string[]) => string };
      const absolute = pathMod.join(vaultRoot, folderPath);
      const failure = await electron.shell.openPath(absolute);
      if (failure) new Notice(t("notice.open-folder-failed", { detail: failure }));
    } catch (err) {
      new Notice(t("notice.templates-folder", { path: folderPath }));
      console.error("ExcaVelo openTemplatesFolder failed:", err);
    }
  }

  openOwnSettings(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setting = (this.app as any).setting;
    if (setting?.open && setting?.openTabById) {
      setting.open();
      setting.openTabById("excavelo");
    } else {
      new Notice(t("notice.open-settings-fallback"));
    }
  }

  private async openNewNoteChooser(): Promise<void> {
    const templates = await this.templates.list();
    if (templates.length === 0) {
      new Notice(
        t("notice.no-templates", { folder: this.settings.templatesFolder })
      );
      return;
    }
    new ChooserModal(
      this.app,
      templates,
      this.settings.defaultTemplate,
      (t) => void this.createNoteFromTemplate(t),
      "new-note"
    ).open();
  }

  private async createNoteFromTemplate(template: Template): Promise<void> {
    const isoDate = new Date().toISOString().slice(0, 10);
    const slug = "untitled";
    const filenamePattern = template.newNoteFilename ?? `{date}-${template.name}-{slug}`;
    const filename = filenamePattern
      .replace(/\{date\}/g, isoDate)
      .replace(/\{slug\}/g, slug)
      .replace(/\{template\}/g, template.name);
    const folder = template.newNoteFolder ?? "";
    const targetPath = folder
      ? normalizePath(`${folder}/${filename}.md`)
      : normalizePath(`${filename}.md`);

    if (this.app.vault.getAbstractFileByPath(targetPath)) {
      new Notice(t("notice.file-exists-rename", { path: targetPath }));
      return;
    }
    if (folder) {
      const folderNorm = normalizePath(folder);
      if (!(this.app.vault.getAbstractFileByPath(folderNorm) instanceof TFolder)) {
        await this.app.vault.createFolder(folderNorm).catch(() => undefined);
      }
    }

    const scaffoldRaw =
      template.newNoteScaffold ??
      `> [!context]\n> Date: {date}\n\n<!-- Write your memo body below this line -->\n`;
    const scaffold = scaffoldRaw.replace(/\{date\}/g, isoDate);

    try {
      const created = await this.app.vault.create(targetPath, scaffold);
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(created);
      new Notice(t("notice.created", { path: targetPath }));
    } catch (err) {
      new Notice(t("notice.error-generic", { detail: (err as Error).message }));
      console.error("ExcaVelo createNoteFromTemplate failed:", err);
    }
  }

  private async openChooser(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice(t("notice.open-note-first"));
      return;
    }
    const templates = await this.templates.list();
    if (templates.length === 0) {
      new Notice(
        t("notice.no-templates", { folder: this.settings.templatesFolder })
      );
      return;
    }
    new ChooserModal(this.app, templates, this.settings.defaultTemplate, (t) => {
      void this.transformAndPreview(view.editor, t);
    }).open();
  }

  private async transformWithDefault(editor: Editor): Promise<void> {
    const template = await this.templates.findByName(this.settings.defaultTemplate);
    if (!template) {
      new Notice(t("notice.default-template-missing", { name: this.settings.defaultTemplate }));
      return;
    }
    await this.transformAndPreview(editor, template);
  }

  private async transformAndPreview(editor: Editor, template: Template): Promise<void> {
    try {
      const { response, transformContext } = await this.runner.run(editor, template);
      const file = this.app.workspace.getActiveFile();
      const isoDate = new Date().toISOString().slice(0, 10);
      const slug = file ? this.slugify(file.basename) : "memo";
      const mapping = resolveWikiOutput(this.wikiConfig, template, slug, isoDate);
      const suggestedSavePath = mapping.savePath
        ? `${mapping.savePath}/${mapping.filename}.md`
        : `${mapping.filename}.md`;

      new PreviewModal(
        this.app,
        this,
        template,
        response,
        transformContext,
        suggestedSavePath,
        (action, ctx) => {
          void this.handlePreviewAction(action, ctx, editor, template, response.text, mapping.frontmatterPreset);
        }
      ).open();
    } catch (err) {
      // Notice already surfaced by runner; nothing else to do.
      console.error("ExcaVelo transform failed:", err);
    }
  }

  private async handlePreviewAction(
    action: PreviewAction,
    ctx: PreviewActionContext,
    editor: Editor,
    template: Template,
    text: string,
    frontmatterPreset: Record<string, unknown> | null
  ): Promise<void> {
    try {
      switch (action) {
        case "append":
          this.appendToEditor(editor, text);
          new Notice(t("notice.appended"));
          return;
        case "save-as-new":
          await this.saveAsNew(ctx.savePath, text, frontmatterPreset);
          return;
        case "replace":
          this.replaceEditor(editor, text);
          new Notice(t("notice.replaced"));
          return;
        case "copy":
          await navigator.clipboard.writeText(text);
          new Notice(t("notice.copied"));
          return;
        case "regenerate":
          await this.transformAndPreview(editor, template);
          return;
        case "discard":
          return;
      }
    } catch (err) {
      new Notice(t("notice.error-generic", { detail: (err as Error).message }));
      console.error("ExcaVelo action failed:", err);
    }
  }

  private appendToEditor(editor: Editor, text: string): void {
    const last = editor.lastLine();
    const lastLen = editor.getLine(last).length;
    const separator = editor.getValue().trim() === "" ? "" : "\n\n";
    editor.replaceRange(separator + text, { line: last, ch: lastLen });
  }

  private replaceEditor(editor: Editor, text: string): void {
    const last = editor.lastLine();
    const lastLen = editor.getLine(last).length;
    editor.replaceRange(text, { line: 0, ch: 0 }, { line: last, ch: lastLen });
  }

  private async saveAsNew(
    savePath: string,
    text: string,
    frontmatterPreset: Record<string, unknown> | null
  ): Promise<void> {
    const normalized = normalizePath(savePath);
    const existing = this.app.vault.getAbstractFileByPath(normalized);
    if (existing) {
      throw new Error(t("notice.file-exists", { path: normalized }));
    }
    const parent = normalized.includes("/") ? normalized.slice(0, normalized.lastIndexOf("/")) : "";
    if (parent && !(this.app.vault.getAbstractFileByPath(parent) instanceof TFolder)) {
      await this.app.vault.createFolder(parent).catch(() => undefined);
    }
    const body = frontmatterPreset ? `${serializeFrontmatter(frontmatterPreset)}\n${text}` : text;
    const created = await this.app.vault.create(normalized, body);
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(created);
    new Notice(t("notice.saved", { path: normalized }));
  }

  private slugify(basename: string): string {
    return basename
      .toLowerCase()
      .replace(/[^a-z0-9\-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "memo";
  }

  private async refreshWikiConfig(): Promise<void> {
    this.wikiConfig = await detectWikiConfig(this.app);
  }
}

function serializeFrontmatter(data: Record<string, unknown>): string {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    lines.push(`${key}: ${serializeYamlScalar(value)}`);
  }
  lines.push("---");
  return lines.join("\n");
}

function serializeYamlScalar(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (/[:#\n"']/.test(value)) return JSON.stringify(value);
    return value;
  }
  return JSON.stringify(value);
}
