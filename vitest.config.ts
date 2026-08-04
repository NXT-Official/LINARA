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
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/tests/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },
});
