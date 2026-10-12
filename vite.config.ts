import { sentryVitePlugin } from "@sentry/bundler-plugins/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

import { resolveSentryBuildConfig } from "./src/lib/observability/sentry-config.ts";

// Where a build writes its source maps: a Vercel build puts the client's in
// .vercel/output/static/assets, a local one in .output. Named rather than
// "./**/*.map", which would delete the maps inside node_modules too.
const SOURCE_MAPS_IN_BUILD_OUTPUT = ["./.output/**/*.map", "./.vercel/output/**/*.map"];

export default defineConfig(({ mode }) => {
  // Load environment variables from the .env file in the workspace root.
  // Passing empty string '' as the third argument loads ALL variables regardless of VITE_ prefix.
  const env = loadEnv(mode, process.cwd(), "");
  // Absolute origin for og:image/og:url -- link scrapers ignore relative URLs.
  // Falls back to Vercel's built-in production hostname when SITE_URL is unset.
  const siteUrl =
    env.SITE_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  // On in Vercel builds only (or with SENTRY_DSN); see the file for the rules.
  const sentry = resolveSentryBuildConfig(env, mode);
  // Readable stack traces in Sentry need the source maps uploaded, which
  // needs a token. Without one the build is exactly as before: no maps.
  const uploadSourceMaps = Boolean(env.SENTRY_AUTH_TOKEN);

  return {
    server: { port: 8080 },
    preview: { port: 8080 },
    // Native Vite 8 resolution of the `@/*` alias declared in tsconfig.json.
    resolve: { tsconfigPaths: true },
    // "hidden": maps are written for the upload but never linked from the
    // bundles, and the plugin deletes them once they're uploaded.
    ...(uploadSourceMaps ? { build: { sourcemap: "hidden" as const } } : {}),
    define: {
      "process.env.SUPABASE_URL": JSON.stringify(env.SUPABASE_URL),
      "process.env.SUPABASE_ANON_KEY": JSON.stringify(env.SUPABASE_ANON_KEY),
      "process.env.USE_MOCK_AI": JSON.stringify(env.USE_MOCK_AI),
      // "on" brings back paying through Linara's Xendit account (KNOWN_GAPS O35).
      "process.env.XENDIT_PAYOUTS": JSON.stringify(env.XENDIT_PAYOUTS),
      "process.env.SITE_URL": JSON.stringify(siteUrl.replace(/\/+$/, "")),
      "process.env.SENTRY_DSN": JSON.stringify(sentry.dsn),
      "process.env.SENTRY_ENVIRONMENT": JSON.stringify(sentry.environment),
      "process.env.SENTRY_RELEASE": JSON.stringify(sentry.release),
    },
    plugins: [
      tailwindcss(),
      nitro(),
      // Entries are auto-resolved from src/: router.tsx, start.ts, server.ts.
      tanstackStart(),
      // Must come after tanstackStart so Start's transforms run first.
      viteReact(),
      // Source maps only. Not sentryTanstackStart(): that also rewrites
      // start.ts's middleware and instruments the server build, which a
      // build without the token would never have exercised.
      // src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/sourcemaps/ · 11.6.0 · 2026-10-12
      ...(uploadSourceMaps
        ? sentryVitePlugin({
            org: "naax-linara",
            project: "linara-web",
            authToken: env.SENTRY_AUTH_TOKEN,
            release: { name: sentry.release || undefined },
            sourcemaps: { filesToDeleteAfterUpload: SOURCE_MAPS_IN_BUILD_OUTPUT },
            telemetry: false,
          })
        : []),
    ],
  };
});
