import { expect, test } from "@playwright/test";

import {
  expectNoSidewaysScroll,
  MANAGER_ROUTES,
  PUBLIC_ROUTES,
  settle,
  watchErrors,
} from "./helpers";

// Signed out, whatever the project's saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("signed out", () => {
  for (const path of PUBLIC_ROUTES) {
    test(`${path} loads cleanly`, async ({ page }) => {
      const watch = watchErrors(page);
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await settle(page);
      await expectNoSidewaysScroll(page);
      expect(watch.errors).toEqual([]);
    });
  }

  for (const path of MANAGER_ROUTES) {
    test(`${path} sends you to log in, without errors`, async ({ page }) => {
      const watch = watchErrors(page);
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
      await settle(page);
      // React #418 (server and browser HTML disagree) surfaced here first.
      expect(watch.errors).toEqual([]);
    });
  }

  test("an unknown page says so", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page.getByText(/not found|404/i).first()).toBeVisible();
  });
});
