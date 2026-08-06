import { test, expect } from "@playwright/test";

test.describe("Helper Claimant Onboarding Smoke Test", () => {
  // Catch and pipe browser errors directly to the terminal
  test.beforeEach(({ page }) => {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error(`[BROWSER CONSOLE ERROR] ${msg.text()}`);
      }
    });
    page.on("pageerror", (err) => {
      console.error(`[BROWSER PAGE EXCEPTION] ${err.stack || err.message}`);
    });
  });

  test("should load the helper today page and render claim-your-account onboarding elements", async ({
    page,
  }) => {
    // 1. Visit the helper landing/today page
    await page.goto("/helper/today");

    // 2. Verify that page title / header loads (Ate Rosa's Station greeting)
    await expect(page.locator("text=Magandang umaga, Ate Rosa.")).toBeVisible();

    // 3. Verify that the claimant onboarding banner is present
    await expect(page.locator("text=New here? Claim your account.")).toBeVisible();

    // 4. Verify that the "Enter code" button is visible and click it
    const enterCodeBtn = page.locator('button:has-text("Enter code")');
    await expect(enterCodeBtn).toBeVisible();

    // Wait for the browser to finish running scripts and bind event handlers (hydrated state)
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500); // Give React 500ms to bind click listeners

    await enterCodeBtn.click();

    // 5. Verify that the claim account modal flow opens
    const modalHeading = page.locator('h3:has-text("Claim your account")');
    await expect(modalHeading).toBeVisible();

    // 6. Verify the claim input field is present
    const codeInput = page.locator('input[id="claim-code"]');
    await expect(codeInput).toBeVisible();
  });
});
