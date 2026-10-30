import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import reactPlugin from "eslint-plugin-react";
import tseslint from "typescript-eslint";
import securityPlugin from "eslint-plugin-security";
import i18nextPlugin from "eslint-plugin-i18next";
import { createRequire } from "node:module";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".nitro",
      ".vinxi",
      ".tanstack",
      ".wrangler",
      ".vercel",
      "node_modules",
      "src/routeTree.gen.ts",
      // Vendored design tooling (the Impeccable skill), not app code.
      ".claude",
      ".impeccable",
    ],
  },
  {
    // Config files and the SQL test runners (supabase/tests) run in Node,
    // not the browser.
    files: [
      "*.config.{js,ts}",
      "src/server.ts",
      "src/start.ts",
      "supabase/tests/**/*.mjs",
      "e2e/**/*.ts",
      "scripts/**/*.mjs",
    ],
    languageOptions: { globals: globals.node },
  },
  // Spread the recommended configurations directly at the array level,
  // or restrict them to files if necessary.
  js.configs.recommended,
  ...tseslint.configs.recommended,
  securityPlugin.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      react: reactPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // ------------------------------------------------------------------
      // A. TanStack Start & SSR Boundaries
      // ------------------------------------------------------------------
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use Next.js `server-only`. Rename file to `*.server.ts` or annotate with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // ------------------------------------------------------------------
      // B. Security & SAST Guardrails (Strict Engineering Safety)
      // ------------------------------------------------------------------
      // 1. Prevent dynamic code execution injections (CWE-95)
      "no-eval": "error",
      "no-implied-eval": "error",

      // 2. Prevent dynamic script injections / Cross-Site Scripting (XSS) (CWE-79)
      // Enforces strict code review before rendering raw strings as HTML
      "react/no-danger": "warn",

      // 3. Prevent Type Evasion bugs (Any escapes type check and introduces runtime vulnerabilities)
      "@typescript-eslint/no-explicit-any": "error",

      // 4. Clean Code Audit: Ensure unused parameters are flagged (helps avoid logic/dead-branch bugs)
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      // 5. Block unsafe RegExp constructs (prevents ReDoS - Regular Expression Denial of Service)
      "prefer-regex-literals": "error",
    },
  },
  {
    // security/detect-object-injection flags every obj[key], and can't see
    // TypeScript key types. All its hits were reviewed for QA (2026-10-02):
    // lookups by a typed union (CATEGORY_LABEL[c]), numeric indexes, and
    // reads by database id. None takes a key from user input into a write,
    // which is what the rule is after. Turned off rather than 40 per-line
    // disables that would hide a real one; review new obj[userInput] writes.
    rules: { "security/detect-object-injection": "off" },
  },
  {
    // Tests, the SQL test runners, the browser tests and the QA script read
    // and write fixed files in this repo.
    files: ["**/*.test.{ts,tsx}", "supabase/tests/**/*.mjs", "e2e/**/*.ts", "scripts/**/*.mjs"],
    rules: { "security/detect-non-literal-fs-filename": "off" },
  },
  {
    // Vendored shadcn/ui, kept as generated: its files export variants next
    // to components, and chart.tsx writes theme CSS (from code, not data).
    files: ["src/components/ui/**"],
    rules: { "react-refresh/only-export-components": "off", "react/no-danger": "off" },
  },
  {
    // Every word a manager reads comes from locales/ (src/lib/i18n): text
    // typed straight into a screen would stay English in every language.
    files: ["src/**/*.tsx"],
    ignores: ["**/*.test.tsx", "src/components/ui/**"],
    plugins: { i18next: i18nextPlugin },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          words: {
            exclude: [
              // The plugin's own defaults: numbers and symbols, CONSTANTS, HTML entities, emoji.
              "[0-9!-/:-@[-`{-~]+",
              "[A-Z_-]+",
              createRequire(import.meta.url)("eslint-plugin-i18next/lib/options/htmlEntities.js"),
              /^\p{Emoji}+$/u,
              // Code, not words: route paths, locale tags with a region, Intl format options.
              "/[\\w/.-]*",
              "[a-z]{2}-[A-Z]{2}",
              "(short|long|narrow|numeric|2-digit)",
              // The peso sign (and the like) is the same in every language.
              "[₱$€¥]+",
            ],
          },
          // Ids and route targets in option lists are code; their label is the text.
          "object-properties": {
            exclude: ["[A-Z_-]+", "key", "id", "value", "to", "type", "kind", "href"],
          },
          "jsx-attributes": {
            include: [
              "placeholder",
              "title",
              "aria-label",
              "alt",
              "label",
              "description",
              "hint",
              "emptyText",
            ],
          },
          callees: {
            exclude: [
              "i18n(ext)?",
              "t",
              "tr",
              "require",
              "addEventListener",
              "removeEventListener",
              "spin",
              "limitText",
              "priceText",
              ".*\\.(includes|indexOf|startsWith|endsWith|has|get)",
            ],
          },
        },
      ],
    },
  },
  eslintPluginPrettier,
);
