import { expect, test } from "@playwright/test";

import { HAS_MANAGER, serverFnName, settle } from "./helpers";

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

  const calls: string[] = [];
  page.on("request", (r) => {
    const name = serverFnName(r.url());
    if (name) calls.push(name);
  });
  await context.setOffline(false);

  await expect.poll(() => calls, { timeout: 15_000 }).toContain("listTicketsFn");
});
