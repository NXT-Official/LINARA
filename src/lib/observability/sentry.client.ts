import * as Sentry from "@sentry/tanstackstart-react";
import type { AnyRouter } from "@tanstack/react-router";

import { watchPagesOpened } from "./page-opened";
import { COLLECT_NO_PERSONAL_DATA, sendHooks, surfaceFor, userFromStorage } from "./sentry-config";

// Baked in by vite.config.ts (resolveSentryBuildConfig). The DSN is empty
// unless this is a Vercel build or SENTRY_DSN was set.
const DSN = process.env.SENTRY_DSN ?? "";
const ENVIRONMENT = process.env.SENTRY_ENVIRONMENT ?? "";
const RELEASE = process.env.SENTRY_RELEASE ?? "";

let started = false;

function localStorageOrNull(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Read when each thing is sent: use-session.ts signs in and out by writing
// localStorage, and Sentry never has to be told.
const signedIn = () => userFromStorage(localStorageOrNull());
const surface = () => surfaceFor(navigator.userAgent);

/**
 * Starts browser reporting: errors, warn/error console lines and a "Page
 * opened" log per page, each carrying the signed-in manager's id. Production
 * builds with a DSN only, so `vite dev` and the test run never report, and
 * never in a browser a test is driving (`npm run qa:live` and E2E runs
 * point Playwright at real deploys, where it would report the failures it
 * provokes). Safe to call again: getRouter can run more than once.
 */
export function initClientSentry(router: AnyRouter): void {
  if (started || !import.meta.env.PROD || !DSN || navigator.webdriver) return;
  started = true;

  Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    release: RELEASE || undefined,
    // src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/migration/v10-to-v11/ · 11.6.0 · 2026-10-12
    dataCollection: COLLECT_NO_PERSONAL_DATA,
    // The app keeps seeing "Failed to fetch" as the browser wrote it; only
    // the copy sent to Sentry gets the host added.
    enhanceFetchErrorMessages: "report-only",
    // Every page load and navigation is traced while a handful of households
    // are testing. Lower it once the monthly span quota in Sentry's usage
    // stats passes half before mid-month.
    tracesSampleRate: 1.0,
    integrations: [
      Sentry.tanstackRouterBrowserTracingIntegration(router),
      // Logs are on by default in v11; this adds console.warn/error to them.
      // src: https://docs.sentry.io/platforms/javascript/guides/tanstackstart-react/logs/ · 11.6.0 · 2026-10-12
      Sentry.consoleLoggingIntegration({ levels: ["warn", "error"] }),
    ],
    // Scrubbed, then tagged with whoever is signed in at that moment.
    ...sendHooks(() => ({ identity: signedIn(), surface: surface() })),
  });

  watchPagesOpened(router, window.location.pathname, (route) =>
    Sentry.logger.info("Page opened", { "linara.route": route }),
  );
}

/**
 * An error a route's error component is showing. The router caught it, so
 * it never reaches window.onerror and Sentry wouldn't see it otherwise.
 */
export function reportCaughtError(error: unknown): void {
  if (started) Sentry.captureException(error);
}
