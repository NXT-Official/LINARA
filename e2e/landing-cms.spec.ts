import { expect, test } from "@playwright/test";

import { LANDING_FALLBACK } from "../src/features/landing/landing-content";
import { expectNoSidewaysScroll, settle, watchErrors } from "./helpers";

/**
 * The public homepage. Its copy comes from the LINARA Studio (Sanity), with a
 * checked-in fallback (LANDING_FALLBACK). Read-only: nothing is saved or sent.
 *
 * Opened directly, the page shows whatever the Studio has published, so those
 * checks look at structure and code-owned links, never at editable wording:
 * a copy edit in the Studio must not fail QA. The exact wording is checked
 * where it can only be the fallback, with the copy request blocked.
 */

// Signed out, whatever the project's saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("homepage", () => {
  test("opens with a headline and no errors", async ({ page }) => {
    const watch = watchErrors(page);
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/\S/);
    await settle(page);
    expect(watch.errors).toEqual([]);
  });

  test("both calls to action open the Manager Pass, and the footer has the legal pages", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link")).toHaveAttribute(
      "href",
      "/manager/pass",
    );
    await expect(
      page.locator('section[aria-labelledby="hero-title"]').getByRole("link"),
    ).toHaveAttribute("href", "/manager/pass");

    const legal = page.getByRole("contentinfo").getByRole("link");
    await expect(legal).toHaveCount(2);
    await expect(legal.nth(0)).toHaveAttribute("href", "/privacy");
    await expect(legal.nth(1)).toHaveAttribute("href", "/terms");
  });

  test("fits a 390px-wide phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await settle(page);
    await expectNoSidewaysScroll(page);
  });

  test("still opens from another page when its copy can't be fetched", async ({ page }) => {
    await page.goto("/privacy");
    // Hydrated, so the click below is an in-app navigation, not a page load.
    await settle(page);

    // In-app, the copy is a network call. Fail it, as a dropped connection
    // would; this used to end on the "This page didn't load" screen.
    let blocked = 0;
    await page.route("**/_serverFn/**", (route) => {
      blocked += 1;
      return route.abort();
    });

    await page.getByRole("link", { name: "Linara — home" }).click();
    await expect(page).toHaveURL((url) => url.pathname === "/");
    const headline = page.getByRole("heading", { level: 1 });
    await expect(headline).toContainText(LANDING_FALLBACK.hero.headlineLine1);
    await expect(headline).toContainText(LANDING_FALLBACK.hero.headlineLine2);
    await expect(page.getByRole("banner").getByRole("link")).toHaveText(
      LANDING_FALLBACK.header.ctaLabel,
    );
    // The request was really made and really failed: without this, a full
    // page load (copy rendered on the server) would pass for the wrong reason.
    expect(blocked, "the homepage's copy request was never made").toBeGreaterThan(0);
  });
});
