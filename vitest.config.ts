import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  plugins: [],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname || "", "./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    // Node 25's built-in localStorage hides jsdom's; see the file.
    setupFiles: ["./src/test/storage.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/tests/**",
      // Playwright's browser tests (npm run test:e2e).
      "e2e/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },
});
