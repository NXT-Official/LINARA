import { expect, test } from "@playwright/test";

import {
  expectNoSidewaysScroll,
  HAS_MANAGER,
  MANAGER_ROUTES,
  serverFnName,
  settle,
  watchErrors,
} from "./helpers";

/**
 * Signed in as the test manager. Nothing here saves, deletes or pays: forms
 * are opened, checked and cancelled, and any payout request is blocked and
 * fails the test. The account's data is read, not changed.
 */
test.skip(!HAS_MANAGER, "Set E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD to run these.");

test.describe("manager", () => {
  for (const path of MANAGER_ROUTES) {
    test(`${path} loads without errors and fits the screen`, async ({ page }) => {
      const watch = watchErrors(page);
      await page.goto(path);
      await expect(page).toHaveURL((url) => url.pathname === path);
      await settle(page);
      await expectNoSidewaysScroll(page);
      expect(watch.errors).toEqual([]);
    });
  }

  test("a pantry item says what's wrong instead of just not saving", async ({ page }) => {
    await page.goto("/manager/pantry");
    await page.getByRole("button", { name: "Add item", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(dialog.getByRole("alert").filter({ hasText: "Give it a name." })).toBeVisible();

    await dialog.getByLabel("Name").fill("E2E check, not saved");
    await dialog.getByLabel("Buy more at").fill("-5");
    await dialog.getByRole("button", { name: "Add", exact: true }).click();
    await expect(
      dialog.getByRole("alert").filter({ hasText: "A number, 0 or more." }),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("a new task without a name says so", async ({ page }) => {
    await page.goto("/manager/pass");
    await page.getByRole("button", { name: "New task" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /Add to board|Send/ }).click();
    await expect(
      dialog.getByRole("alert").filter({ hasText: "Give the task a name." }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("palengke items have a Bought checkbox", async ({ page }) => {
    await page.goto("/manager/pantry");
    await settle(page);
    const boxes = page.getByRole("checkbox", { name: /^Bought / });
    test.skip((await boxes.count()) === 0, "The palengke list is empty.");
    await expect(boxes.first()).toBeVisible();
  });

  test("paying shows where to send it, and Cancel records nothing", async ({ page }) => {
    // Linara moves no money (KNOWN_GAPS O35): no payout through Xendit, and
    // nothing recorded until "I've sent it".
    const calls: string[] = [];
    await page.route("**/_serverFn/**", (route) => {
      const name = serverFnName(route.request().url());
      if (name === "initiatePayoutFn" || name === "recordOffAppPaymentFn") {
        calls.push(name);
        return route.abort();
      }
      return route.continue();
    });

    await page.goto("/manager/money");
    await settle(page);
    await expect(page.getByRole("button", { name: /Pay via GCash|via GCash$/ })).toHaveCount(0);
    const pay = page.getByRole("button", { name: /by GCash or Maya$/ });
    test.skip((await pay.count()) === 0, "Nothing to pay right now.");

    await pay.first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /^Pay .+ by (GCash|Maya)$/ })).toBeVisible();
    // Her number (saved by her, or from the invite), or how to get one.
    await expect(
      dialog.getByText(/(GCash|Maya) number|no (GCash|Maya) number/).first(),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect(calls).toEqual([]);
  });

  test("the household menu lists your households and how to add one", async ({ page }) => {
    await page.goto("/manager/pass");
    await settle(page);
    const menu = page.getByRole("button", { name: /^Household: / });
    await expect(menu).toBeVisible();
    await menu.click();
    await expect(page.getByRole("menuitem", { name: /New household/ })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Join with a code/ })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  test("People lists the managers; the primary can invite one", async ({ page }) => {
    await page.goto("/manager/people");
    await settle(page);
    await expect(page.getByRole("heading", { name: "Managers" })).toBeVisible();
    await expect(page.getByText("You", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: /Invite a manager/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("radio", { name: /Co-manager/ })).toBeChecked();
    await expect(dialog.getByRole("radio", { name: /Remote admin/ })).toBeVisible();
    // Closing without "Make a code" makes nothing.
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });
});
