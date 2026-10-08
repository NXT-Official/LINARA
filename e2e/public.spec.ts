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

  // QA LM-4: the server redirects, rather than rendering the page and leaving
  // the browser to move on once its scripts load.
  for (const path of MANAGER_ROUTES) {
    test(`${path} answers a signed-out request with a 307 to /login`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status()).toBe(307);
      expect(response.headers().location).toBe("/login");
    });
  }

  test("an unknown page says so", async ({ page }) => {
    await page.goto("/no-such-page");
    await expect(page.getByText(/not found|404/i).first()).toBeVisible();
  });

  // QA LMM-A2: name and household are asked once, on "Finish setting up".
  test("sign-up asks only for the account", async ({ page }) => {
    await page.goto("/signup?step=household");
    await expect(page.getByRole("heading", { name: "Set up your household" })).toBeVisible();
    await expect(page.getByText("Your name")).toHaveCount(0);
    await expect(page.getByText("Household name")).toHaveCount(0);
    await expect(page.getByText("Confirm password")).toBeVisible();
  });
});

// QA LMM-A6: inside LINARA_MOBILE's WebView (its user agent says
// "LinaraApp"), sign-up's links go to the app's own screens, by message.
test.describe("signed out, inside the app", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile LinaraApp" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const sent: unknown[] = [];
      Object.assign(window, {
        __sent: sent,
        ReactNativeWebView: { postMessage: (m: string) => sent.push(JSON.parse(m)) },
      });
    });
  });

  const sent = (page: import("@playwright/test").Page) =>
    page.evaluate(() => (window as unknown as { __sent: unknown[] }).__sent);

  test("Log in opens the app's sign-in, not the web's", async ({ page }) => {
    await page.goto("/login?mode=signup");
    await expect(page.getByRole("heading", { name: "Set up your household" })).toBeVisible();
    await page.getByRole("button", { name: "Already have an account? Log in" }).click();
    await expect.poll(() => sent(page)).toEqual([{ type: "open-screen", screen: "sign-in" }]);
    await expect(page).toHaveURL(/\/signup/);
  });

  test("I work in a household opens the app's kasambahay start", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("button", { name: /I work in a household/ }).click();
    await expect.poll(() => sent(page)).toEqual([{ type: "open-screen", screen: "kasambahay" }]);
  });
});
