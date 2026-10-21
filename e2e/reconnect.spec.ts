import { expect, test } from "@playwright/test";

import { HAS_MANAGER, settle } from "./helpers";

/**
 * Signed in as the test manager. Coming back online reloads the board, since
 * Realtime doesn't replay what changed while the connection was down (same
 * gap as the app's QA F-LM-008). Only reads: nothing is saved.
 */
test.skip(!HAS_MANAGER, "Set E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD to run these.");

test("the board reloads by itself when the connection comes back", async ({ page, context }) => {
  await page.goto("/manager/pass");
  await settle(page);

  await context.setOffline(true);
  await page.waitForTimeout(1_000);

  // Any server function will do: a production build names them by hash, so
  // serverFnName can't tell which list it is, and before the fix nothing at
  // all was asked for after reconnecting.
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/_serverFn/")) calls.push(r.url());
  });
  await context.setOffline(false);

  await expect.poll(() => calls.length, { timeout: 15_000 }).toBeGreaterThan(0);
});
