import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 8080 },
  preview: { port: 8080 },
  // Native Vite 8 resolution of the `@/*` alias declared in tsconfig.json.
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    nitro(),
    // Entries are auto-resolved from src/: router.tsx, start.ts, server.ts.
    tanstackStart(),
    // Must come after tanstackStart so Start's transforms run first.
    viteReact(),
  ],
});
