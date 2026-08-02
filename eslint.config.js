import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import reactPlugin from "eslint-plugin-react";
import tseslint from "typescript-eslint";
import securityPlugin from "eslint-plugin-security";

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
    ],
  },
  {
    // Config files run in Node, not the browser.
    files: ["*.config.{js,ts}", "src/server.ts", "src/start.ts"],
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
      "react": reactPlugin,
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
          varsIgnorePattern: "^_" 
        }
      ],

      // 5. Block unsafe RegExp constructs (prevents ReDoS - Regular Expression Denial of Service)
      "prefer-regex-literals": "error",
    },
  },
  eslintPluginPrettier,
);

