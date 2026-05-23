/**
 * Lightweight i18n for excaVelo.
 *
 * Locale detection (in order):
 *   1. `window.localStorage.getItem("language")` — Obsidian's own language
 *      setting; this is the community-plugin convention for reading the
 *      user's chosen UI language.
 *   2. `navigator.language` (first two letters) — best-effort fallback.
 *   3. `"en"` — final fallback.
 *
 * The locale is captured once when the plugin loads. Switching Obsidian's
 * language at runtime requires reloading the plugin (toggle off/on in
 * Community plugins) for the new strings to take effect — same caveat
 * applies to most plugins that ship their own translations.
 */

import en from "./en";
import ko from "./ko";

type Dict = Record<string, string>;

const dicts: Record<string, Dict> = { en, ko };

function detectLocale(): string {
  try {
    const raw = window.localStorage.getItem("language");
    if (raw && dicts[raw]) return raw;
    const nav = (navigator.language || "en").toLowerCase().split("-")[0];
    if (dicts[nav]) return nav;
  } catch {
    // SSR / sandboxed environments — fall through to default.
  }
  return "en";
}

const locale = detectLocale();

export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = dicts[locale] ?? en;
  let text = dict[key] ?? en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

/**
 * Exposed for diagnostics (e.g. logging which locale the plugin resolved to).
 * Avoid using this for behavior decisions — pass through `t()` instead.
 */
export function currentLocale(): string {
  return locale;
}
