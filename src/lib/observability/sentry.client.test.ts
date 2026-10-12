// @vitest-environment jsdom
import type { AnyRouter } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

// The SDK is the one thing replaced: what's under test is what this app
// hands it (options, hooks, logs), not what Sentry does with them.
const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  logger: { info: vi.fn() },
  tanstackRouterBrowserTracingIntegration: vi.fn(() => ({ name: "BrowserTracing" })),
  consoleLoggingIntegration: vi.fn(() => ({ name: "ConsoleLogs" })),
}));
vi.mock("@sentry/tanstackstart-react", () => sentry);

const DSN = "https://key@o1.ingest.us.sentry.io/2";
const USER_ID = "0b6f5f7e-aaaa-bbbb-cccc-000000000001";
// use-session writes it too; nothing here may send it.
const HOUSEHOLD_ID = "7d1c2a9e-aaaa-bbbb-cccc-000000000002";

type Hooks = {
  beforeSend: (event: Record<string, unknown>) => Record<string, unknown>;
  beforeSendLog: (log: Record<string, unknown>) => Record<string, unknown>;
  beforeSendSpan: (span: Record<string, unknown>) => Record<string, unknown>;
  beforeBreadcrumb: (crumb: Record<string, unknown>) => Record<string, unknown>;
  dataCollection: Record<string, unknown>;
};

function initOptions(): Hooks {
  return sentry.init.mock.calls[0]?.[0] as Hooks;
}

/** A router whose only pages are "/" and the Pass, and that can resolve a navigation. */
function fakeRouter() {
  const listeners: Array<(event: { toLocation: { pathname: string } }) => void> = [];
  const routes: Record<string, Array<{ id: string }>> = {
    "/": [{ id: "__root__" }, { id: "/" }],
    "/manager/pass": [{ id: "__root__" }, { id: "/_app" }, { id: "/_app/manager/pass" }],
  };
  const router = {
    getMatchedRoutes: (pathname: string) => [routes[pathname] ?? [], {}, undefined],
    subscribe: (_event: string, fn: (typeof listeners)[number]) => {
      listeners.push(fn);
      return () => undefined;
    },
  };
  const resolve = (pathname: string) => listeners.forEach((fn) => fn({ toLocation: { pathname } }));
  return { router: router as unknown as AnyRouter, resolve };
}

async function load({ prod = true, dsn = DSN }: { prod?: boolean; dsn?: string } = {}) {
  vi.resetModules();
  vi.stubEnv("PROD", prod);
  vi.stubEnv("SENTRY_DSN", dsn);
  return import("./sentry.client");
}

function signIn() {
  window.localStorage.setItem("linara_manager_user_id", USER_ID);
  window.localStorage.setItem("linara_manager_household_id", HOUSEHOLD_ID);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe("initClientSentry", () => {
  it("never starts under vite dev or a test run, even with a DSN", async () => {
    const { initClientSentry, reportCaughtError } = await load({ prod: false });
    initClientSentry(fakeRouter().router);
    reportCaughtError(new Error("boom"));
    expect(sentry.init).not.toHaveBeenCalled();
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.logger.info).not.toHaveBeenCalled();
  });

  it("never starts in a browser a test drives (npm run qa:live, E2E against a deploy)", async () => {
    // jsdom has no navigator.webdriver; Playwright and Selenium set it to true.
    Object.defineProperty(navigator, "webdriver", { value: true, configurable: true });
    try {
      const { initClientSentry, reportCaughtError } = await load();
      initClientSentry(fakeRouter().router);
      reportCaughtError(new Error("provoked by a test"));
      expect(sentry.init).not.toHaveBeenCalled();
      expect(sentry.captureException).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, "webdriver");
    }
  });

  it("never starts without a DSN (a build that isn't on Vercel)", async () => {
    const { initClientSentry } = await load({ dsn: "" });
    initClientSentry(fakeRouter().router);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("starts once, however many times the router is made", async () => {
    const { initClientSentry } = await load();
    initClientSentry(fakeRouter().router);
    initClientSentry(fakeRouter().router);
    expect(sentry.init).toHaveBeenCalledTimes(1);
    expect(initOptions().dataCollection).toMatchObject({ userInfo: false, cookies: false });
  });

  it("puts whoever is signed in when an error is sent on it, not who was at start", async () => {
    const { initClientSentry } = await load();
    initClientSentry(fakeRouter().router);
    const { beforeSend } = initOptions();

    expect(beforeSend({ message: "before sign-in" }).user).toBeUndefined();

    signIn();
    const event = beforeSend({
      message: "Payout to 09171234567 failed",
      request: {
        url: "https://linara.app/reset-password#access_token=t",
        headers: { Referer: "https://linara.app/login" },
      },
    });
    expect(event).toEqual({
      message: "Payout to [phone] failed",
      request: { url: "https://linara.app/reset-password" },
      user: { id: USER_ID },
      tags: { "linara.surface": "web" },
    });

    window.localStorage.clear();
    expect(beforeSend({ message: "after sign-out" }).user).toBeUndefined();
  });

  it("tags reports from inside the mobile app's WebView", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 Mobile LinaraApp");
    const { initClientSentry } = await load();
    initClientSentry(fakeRouter().router);
    const event = initOptions().beforeSend({});
    expect(event.tags).toEqual({ "linara.surface": "mobile-webview" });
    vi.restoreAllMocks();
  });

  it("gives every log and span the signed-in manager's id, scrubbed", async () => {
    const { initClientSentry } = await load();
    initClientSentry(fakeRouter().router);
    signIn();
    const { beforeSendLog, beforeSendSpan, beforeBreadcrumb } = initOptions();

    expect(
      beforeSendLog({ level: "warn", message: "No account for maria@example.com", attributes: {} }),
    ).toEqual({
      level: "warn",
      message: "No account for [email]",
      attributes: {
        "user.id": USER_ID,
        "linara.surface": "web",
      },
    });
    expect(
      beforeSendSpan({
        name: "/_app/manager/pass",
        attributes: { "url.full": "https://linara.app/manager/pass?helper=7" },
      }).attributes,
    ).toEqual({
      "url.full": "https://linara.app/manager/pass?helper=[Filtered]",
      "user.id": USER_ID,
      "linara.surface": "web",
    });
    expect(
      beforeBreadcrumb({ category: "navigation", data: { from: "/x#t", to: "/y?a=1" } }),
    ).toEqual({ category: "navigation", data: { from: "/x", to: "/y?a=[Filtered]" } });
  });

  it("logs the page it opened on and each page after, by route template", async () => {
    const { initClientSentry } = await load();
    const { router, resolve } = fakeRouter();
    initClientSentry(router);
    resolve("/manager/pass");
    expect(sentry.logger.info.mock.calls).toEqual([
      ["Page opened", { "linara.route": "/" }],
      ["Page opened", { "linara.route": "/_app/manager/pass" }],
    ]);
  });
});

describe("reportCaughtError", () => {
  it("reports an error a route's error component is showing", async () => {
    const { initClientSentry, reportCaughtError } = await load();
    initClientSentry(fakeRouter().router);
    const error = new Error("supabaseUrl is required.");
    reportCaughtError(error);
    expect(sentry.captureException).toHaveBeenCalledWith(error);
  });
});
