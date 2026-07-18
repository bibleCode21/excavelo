/**
 * Lightweight i18n for ExcaVelo.
 *
 * Locale detection (in order):
 *   1. The plugin-level language setting, when not "auto".
 *   2. Obsidian's `getLanguage()` (>=1.8.7) — the app's own UI language
 *      setting; below that, `window.localStorage.getItem("language")` reads
 *      the same underlying value (minAppVersion is 1.5.0, pre-getLanguage()).
 *   3. `navigator.language` (first two letters) — best-effort fallback.
 *   4. `"en"` — final fallback.
 *
 * Command palette entries register their names at plugin load, so switching
 * the language requires reloading the plugin (toggle off/on in Community
 * plugins) for those to update — other UI strings follow immediately.
 */

import { getLanguage, requireApiVersion } from "obsidian";
import en from "./en";
import ko from "./ko";

type Dict = Record<string, string>;

const dicts: Record<string, Dict> = { en, ko };

let localeOverride: "en" | "ko" | null = null;

/** Plugin-level language setting; "auto" defers to Obsidian's app language. */
export function setLocaleOverride(v: "auto" | "en" | "ko"): void {
  localeOverride = v === "auto" ? null : v;
}

function detectLocale(): string {
  if (localeOverride) return localeOverride;
  try {
    // obsidianmd/prefer-get-language flags the line below regardless of the guard;
    // eslint-disable comments cannot silence obsidianmd/* rules (eslint-comments/no-restricted-disable).
    // The fallback is required for <1.8.7 (minAppVersion is 1.5.0); getLanguage() is used above that version.
    const raw = requireApiVersion("1.8.7") ? getLanguage() : window.localStorage.getItem("language");
    if (raw && dicts[raw]) return raw;
    const nav = (navigator.language || "en").toLowerCase().split("-")[0];
    if (dicts[nav]) return nav;
  } catch {
    // SSR / sandboxed environments — fall through to default.
  }
  return "en";
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = dicts[detectLocale()] ?? en;
  let text = dict[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

/**
 * Exposed for locale-dependent display choices (e.g. template description_ko)
 * and diagnostics. For plain strings, pass through `t()` instead.
 */
export function currentLocale(): string {
  return detectLocale();
}
