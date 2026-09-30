import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load environment variables from the .env file in the workspace root.
  // Passing empty string '' as the third argument loads ALL variables regardless of VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), "");
  // Absolute origin for og:image/og:url -- link scrapers ignore relative URLs.
  // Falls back to Vercel's built-in production hostname when SITE_URL is unset.
  const siteUrl =
    env.SITE_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");

  return {
    server: { port: 8080 },
    preview: { port: 8080 },
    // Native Vite 8 resolution of the `@/*` alias declared in tsconfig.json.
    resolve: { tsconfigPaths: true },
    define: {
      "process.env.SUPABASE_URL": JSON.stringify(env.SUPABASE_URL),
      "process.env.SUPABASE_ANON_KEY": JSON.stringify(env.SUPABASE_ANON_KEY),
      "process.env.USE_MOCK_AI": JSON.stringify(env.USE_MOCK_AI),
      "process.env.SITE_URL": JSON.stringify(siteUrl.replace(/\/+$/, "")),
    },
    plugins: [
      tailwindcss(),
      nitro(),
      // Entries are auto-resolved from src/: router.tsx, start.ts, server.ts.
      tanstackStart(),
      // Must come after tanstackStart so Start's transforms run first.
      viteReact(),
    ],
  };
});
