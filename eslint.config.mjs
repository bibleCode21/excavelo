import tsplugin from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

// Flat-config form (ESLint v9). Rules follow Obsidian's sample-plugin
// recommendation: TypeScript-recommended baseline with a few opt-outs that
// are ergonomically painful in Obsidian plugin code.
//
// `obsidianmd/no-unsupported-api` is the rule Obsidian's own community-plugin
// review runs, and the reason it is here: 1.4.1 shipped `setDestructive()`
// (@since 1.13.0) against `minAppVersion: 1.5.0`, lint was green, and the
// review rejected the release. Nothing local could have caught it. It needs
// type information — hence `project` below — because it resolves the receiver
// of each call and compares the API's @since against manifest.json.
//
// Only this one rule of the plugin is enabled. Its `recommended` set reports
// 65 more findings here (declarative settings API, sentence-case UI text);
// adopting those is real work and does not belong in a release fix.
export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: 2020,
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tsplugin, obsidianmd },
    rules: {
      ...tsplugin.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
      "@typescript-eslint/ban-ts-comment": "off",
      "no-prototype-builtins": "off",
      "@typescript-eslint/no-empty-function": "off",
      "obsidianmd/no-unsupported-api": "error",
    },
  },
];
