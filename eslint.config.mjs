import obsidianmd from "eslint-plugin-obsidianmd";

// Flat-config form (ESLint v9). Spreads eslint-plugin-obsidianmd's own
// `recommended` config wholesale — this is the exact ruleset Obsidian's
// community-plugin review runs (bundles typescript-eslint v8), so local
// lint and the review bot now share one source instead of a hand-picked
// subset that can silently drift from what the bot enforces.
export default [
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
      "@typescript-eslint/ban-ts-comment": "off",
      "no-prototype-builtins": "off",
      "@typescript-eslint/no-empty-function": "off",
    },
  },
  {
    // Both files guard Node API access behind Platform.isDesktop; the
    // recommended config only registers browser globals, so require()/
    // process/NodeJS read as no-undef here without this.
    files: ["src/core/git-log.ts", "src/llm/claude-code-cli.ts"],
    languageOptions: {
      globals: {
        require: "readonly",
        process: "readonly",
        NodeJS: "readonly",
      },
    },
  },
];
