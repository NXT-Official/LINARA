// @vitest-environment jsdom
import * as Sentry from "@sentry/tanstackstart-react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterAll, describe, expect, it, vi } from "vitest";

// Vitest loads packages the way Node does, which picks the SDK's server
// build. This test is about what the browser build sends, so it loads that.
const { browserBuild } = vi.hoisted(() => ({
  browserBuild: "../../../node_modules/@sentry/tanstackstart-react/build/esm/index.client.js",
}));
vi.mock(
  "@sentry/tanstackstart-react",
  () => import(browserBuild) as Promise<typeof import("@sentry/tanstackstart-react")>,
);

const USER_ID = "0b6f5f7e-aaaa-bbbb-cccc-000000000001";

function realRouter() {
  const rootRoute = createRootRoute();
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: "/" }),
    createRoute({ getParentRoute: () => rootRoute, path: "/manager/pass" }),
  ]);
  return createRouter({
    routeTree,
    isServer: false,
    history: createMemoryHistory({ initialEntries: ["/manager/pass"] }),
  });
}

afterAll(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("browser reporting, end to end through the real SDK", () => {
  it("sends the manager's id and none of the personal data a failure can carry", async () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("SENTRY_DSN", "http://public@127.0.0.1:9/1");
    // Nothing leaves the test: every send is answered here.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    window.history.replaceState(
      null,
      "",
      "/manager/pass?email=maria%40example.com#access_token=SECRET-ACCESS-TOKEN",
    );
    window.localStorage.setItem("linara_manager_user_id", USER_ID);
    window.localStorage.setItem("linara_manager_household_id", "HOUSEHOLD-NOT-SENT");

    const { initClientSentry, reportCaughtError } = await import("./sentry.client");
    initClientSentry(realRouter());
    const client = Sentry.getClient();
    expect(client?.constructor.name).toBe("BrowserClient");
    const envelopes: unknown[] = [];
    client?.on("beforeEnvelope", (envelope) => envelopes.push(envelope));

    // The reviewer's payloads: a failed insert thrown as a plain object, and
    // the console lines the app's hooks write when a write fails.
    reportCaughtError({
      code: "23514",
      details: "Failing row contains (Rosa Reyes, 34-7654321-0)",
    });
    console.error("[useX] Failed to add helper:", {
      message: "violates check",
      details: "Failing row contains (Maria Santos, 34-1234567-8, 6000.00)",
    });
    console.warn({ helperName: "Juana Dela Cruz", wage: 6000 }, "note");
    // A printf token: Sentry joins every argument into the line.
    console.error("Insert failed: %o", {
      details: "Failing row contains (Carmen Ortiz, 34-1111111-1)",
    });
    console.warn("No payslip yet for %s", "Carmen Ortiz");
    // A planner chip labelled with a helper's name, clicked (a breadcrumb).
    const chip = document.createElement("button");
    chip.setAttribute("aria-label", "Remove Carmen Ortiz");
    document.body.append(chip);
    chip.click();
    // Postgres quotes the value it couldn't read.
    reportCaughtError(new Error('invalid input syntax for type uuid: "Lorna Bautista"'));
    // An error after all of that carries it as breadcrumbs.
    reportCaughtError(new Error("after the console lines"));
    // A web-vital span names the element it measured (INP here).
    Sentry.startSpan(
      {
        name: 'body > button[aria-label="Remove Carmen Ortiz"]',
        op: "ui.interaction.click",
        forceTransaction: true,
        attributes: { "inp.element": 'body > button[aria-label="Remove Carmen Ortiz"]' },
      },
      () => undefined,
    );
    await Sentry.flush(2000);

    const sent = JSON.stringify(envelopes);
    for (const personal of [
      "Rosa Reyes",
      "34-7654321-0",
      "Maria Santos",
      "34-1234567-8",
      "6000.00",
      "Juana",
      "helperName",
      "wage",
      "maria",
      "SECRET-ACCESS-TOKEN",
      "HOUSEHOLD-NOT-SENT",
      "Carmen",
      "34-1111111-1",
      "Lorna",
    ]) {
      expect(sent, personal).not.toContain(personal);
    }
    expect(sent).toContain(USER_ID);
    expect(sent).toContain("[useX] Failed to add helper: violates check");
    expect(sent).toContain("Insert failed: {}");
    expect(sent).toContain("No payslip yet for {}");
    expect(sent).toContain('invalid input syntax for type uuid: \\"[Filtered]\\"');
    expect(sent).toContain("after the console lines");
    expect(sent).toContain("Page opened");
    // The span really went out (the buffer flushed), with its element masked.
    expect(sent).toContain('"inp.element"');
    expect(sent).toContain("body > button[aria-label]");
  });
});
