import { expect, type Page } from "@playwright/test";

export const MANAGER_EMAIL = process.env.E2E_MANAGER_EMAIL ?? "";
export const MANAGER_PASSWORD = process.env.E2E_MANAGER_PASSWORD ?? "";
export const HAS_MANAGER = Boolean(MANAGER_EMAIL && MANAGER_PASSWORD);

/** Every manager page; the crawl visits each. */
export const MANAGER_ROUTES = [
  "/manager/pass",
  "/manager/schedule",
  "/manager/pantry",
  "/manager/money",
  "/manager/people",
];

/** Pages anyone can open. */
export const PUBLIC_ROUTES = ["/login", "/privacy", "/terms", "/reset-password"];

/**
 * Collects console errors and uncaught exceptions (React's #418 shows up as
 * the latter). Call before navigating; read `.errors` after.
 */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));
  return { errors };
}

/** No sideways scroll: the page fits the viewport's width. */
export async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, "page is wider than the screen").toBeLessThanOrEqual(1);
}

/** Lets the page settle: data loads, realtime connects, late errors land. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_000);
}

/**
 * The name of the server function a request calls, e.g. "initiatePayoutFn".
 * TanStack Start encodes it in the URL as base64url JSON.
 */
export function serverFnName(url: string): string | null {
  const match = /\/_serverFn\/([A-Za-z0-9_-]+)/.exec(url);
  if (!match) return null;
  try {
    const decoded = JSON.parse(Buffer.from(match[1], "base64url").toString("utf8")) as {
      export?: string;
    };
    return decoded.export?.split("_createServerFn")[0] ?? null;
  } catch {
    return null;
  }
}
