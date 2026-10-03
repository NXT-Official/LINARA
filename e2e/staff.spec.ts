import { expect, test } from "@playwright/test";

import { HAS_STAFF, settle, STAFF_EMAIL, STAFF_PASSWORD, watchErrors } from "./helpers";

/**
 * House staff use the app (LINARA_MOBILE), not this dashboard. Signing in
 * here as one should say so and leave no manager session behind. Only
 * signs in; nothing is changed.
 */
test.skip(!HAS_STAFF, "Set E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD to run these.");

test.use({ storageState: { cookies: [], origins: [] } });

test("house staff signing in are sent to the app, not the dashboard", async ({ page }) => {
  const watch = watchErrors(page);
  await page.goto("/login");
  await page.getByLabel("Email").fill(STAFF_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(STAFF_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByRole("heading", { name: "Nasa app ang Linara mo" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page).toHaveURL(/\/login/);
  const managerKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("linara_manager_")),
  );
  expect(managerKeys).toEqual([]);

  // And the dashboard stays shut.
  await page.goto("/manager/pass");
  await expect(page).toHaveURL(/\/login/);
  await settle(page);
  expect(watch.errors).toEqual([]);
});
