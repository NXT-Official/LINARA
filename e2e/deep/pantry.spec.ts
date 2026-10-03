import { expect, test, type Page } from "@playwright/test";

import { HAS_MANAGER, settle, watchErrors } from "../helpers";
import { deepName, sweepDeepRows } from "./cleanup";

/**
 * Pantry and palengke together (plan.md 2.5): an item that's run out is
 * suggested for the list, adding it makes a real line, ticking that line
 * bought restocks the pantry (the add-grocery-restock.sql trigger, C82),
 * and unticking takes it back off. Then both are removed through the UI,
 * and cleanup.ts deletes anything a failure left.
 */
test.skip(!HAS_MANAGER, "Set E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD to run these.");
test.describe.configure({ mode: "serial" });

const name = deepName("pantry");

const pantry = (page: Page) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Pantry", exact: true }) });
const groceries = (page: Page) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Grocery list", exact: true }) });
const onHand = (page: Page) =>
  pantry(page).getByRole("button", { name: `Edit how much ${name} is on hand` });

test.beforeAll(async () => {
  await sweepDeepRows("pantry");
});

test.afterAll(async () => {
  await sweepDeepRows("pantry");
});

test("an item that's run out is suggested for the list", async ({ page }) => {
  const watch = watchErrors(page);
  await page.goto("/manager/pantry");
  await settle(page);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("On hand").fill("0");
  await dialog.getByLabel("Buy more at").fill("3");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(dialog).toBeHidden();

  await expect(onHand(page)).toHaveText(/^0\b/);
  // The innermost element holding both is the suggestion's own row.
  const suggestion = groceries(page)
    .locator("div")
    .filter({ hasText: name })
    .filter({ has: page.getByRole("button", { name: "Add to list" }) })
    .last();
  await expect(suggestion).toBeVisible();
  await suggestion.getByRole("button", { name: "Add to list" }).click();
  await expect(groceries(page).getByRole("checkbox", { name: `Bought ${name}` })).toBeVisible();
  expect(watch.errors).toEqual([]);
});

test("ticking it bought restocks the pantry, and unticking takes it back", async ({ page }) => {
  await page.goto("/manager/pantry");
  await settle(page);
  const bought = groceries(page).getByRole("checkbox", { name: `Bought ${name}` });

  await bought.click();
  await expect(bought).toHaveAttribute("aria-checked", "true");
  await expect(onHand(page)).toHaveText(/^3\b/);

  // Still true after a reload: it's the database, not this page.
  await page.reload();
  await settle(page);
  await expect(onHand(page)).toHaveText(/^3\b/);

  await bought.click();
  await expect(bought).toHaveAttribute("aria-checked", "false");
  await expect(onHand(page)).toHaveText(/^0\b/);
});

test("both can be removed, and removing from the pantry asks first", async ({ page }) => {
  await page.goto("/manager/pantry");
  await settle(page);
  await groceries(page)
    .getByRole("button", { name: `Remove ${name}` })
    .click();
  await expect(groceries(page).getByRole("checkbox", { name: `Bought ${name}` })).toBeHidden();

  await pantry(page)
    .getByRole("button", { name: `Remove ${name}` })
    .click();
  await pantry(page).getByRole("button", { name: "Remove", exact: true }).click();
  await expect(onHand(page)).toBeHidden();

  await page.reload();
  await settle(page);
  await expect(page.getByText(name)).toHaveCount(0);
});
