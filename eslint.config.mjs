import tsplugin from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

// Flat-config form (ESLint v9). Rules follow Obsidian's sample-plugin
// recommendation: TypeScript-recommended baseline with a few opt-outs that
// are ergonomically painful in Obsidian plugin code.
export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { sourceType: "module", ecmaVersion: 2020 },
    },
    plugins: { "@typescript-eslint": tsplugin },
    rules: {
      ...tsplugin.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
      "@typescript-eslint/ban-ts-comment": "off",
      "no-prototype-builtins": "off",
      "@typescript-eslint/no-empty-function": "off",
    },
  },
];
