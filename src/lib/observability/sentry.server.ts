import * as Sentry from "@sentry/tanstackstart-react";

import { COLLECT_NO_PERSONAL_DATA, sendHooks } from "./sentry-config";

// Baked in by vite.config.ts (resolveSentryBuildConfig). The DSN is empty
// unless this is a Vercel build or SENTRY_DSN was set.
const DSN = process.env.SENTRY_DSN ?? "";
const ENVIRONMENT = process.env.SENTRY_ENVIRONMENT ?? "";
const RELEASE = process.env.SENTRY_RELEASE ?? "";

// A production server build with a DSN only: never `vite dev` or a test run.
const enabled = typeof window === "undefined" && import.meta.env.PROD && DSN !== "";

// Started on import: server.ts imports this first. Vercel can't preload a
// file with --import, so this is the documented serverless setup.
// src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/manual-setup/ · 11.6.0 · 2026-10-12
if (enabled) {
  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: RELEASE || undefined,
    dataCollection: COLLECT_NO_PERSONAL_DATA,
    integrations: [Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] })],
    // Scrubbed only: the server has nobody signed in to put on it.
    ...sendHooks(),
  });
}

/**
 * Reports an error the server is about to turn into its 500 page. Those
 * never reach Sentry on their own: wrapFetchWithSentry and the global
 * middlewares only see errors still in flight, not a handled Response. Waits
 * for the send (up to 2s) because a serverless function can be frozen as
 * soon as it responds. Never throws: reporting can't be why a request fails.
 * src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/manual-setup/ · 11.6.0 · 2026-10-12
 */
export async function captureServerError(error: unknown): Promise<void> {
  if (!enabled) return;
  try {
    Sentry.captureException(error);
    await Sentry.flush(2000);
  } catch {
    // Nothing to do: the error page goes out either way.
  }
}
