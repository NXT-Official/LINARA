import { expect, test } from "@playwright/test";

import { HAS_MANAGER, settle, watchErrors } from "../helpers";
import { deepName, sweepDeepRows } from "./cleanup";

/**
 * A task's whole life, the way QA walked it (2026-10-02): create it on the
 * Pass, see it survive a reload and show on the Schedule, move its time,
 * cancel it. Unassigned on purpose: no helper's day changes, so nobody is
 * pushed a notification and no rest-owed entry can be written. Deleted
 * afterwards (cleanup.ts).
 */
test.skip(!HAS_MANAGER, "Set E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD to run these.");
test.describe.configure({ mode: "serial" });

const title = deepName("task");

test.beforeAll(async () => {
  await sweepDeepRows("tasks");
});

test.afterAll(async () => {
  await sweepDeepRows("tasks");
});

test("a new task shows on the Pass and survives a reload", async ({ page }) => {
  const watch = watchErrors(page);
  await page.goto("/manager/pass");
  await settle(page);
  await page.getByRole("button", { name: "New task" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Assign to").selectOption({ label: "Unassigned (decide later)" });
  // The date stays the day the Pass is showing (today).
  await dialog.getByLabel("Time").fill("23:30");
  await dialog.getByRole("button", { name: /Add to board|Send/ }).click();
  await expect(dialog).toBeHidden();

  const card = page.getByRole("button", { name: title });
  await expect(card).toBeVisible();
  await page.reload();
  await settle(page);
  await expect(card).toBeVisible();
  expect(watch.errors).toEqual([]);
});

test("moving its time saves", async ({ page }) => {
  await page.goto("/manager/pass");
  await settle(page);
  await page.getByRole("button", { name: title }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Edit task" })).toBeVisible();
  await dialog.getByLabel("Time").fill("22:15");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await settle(page);
  // Its card, or the Unassigned lane folded to "Next up · 10:15 PM <title>".
  await expect(
    page.locator("article, button").filter({ hasText: title }).filter({ hasText: "10:15" }).first(),
  ).toBeVisible();
});

test("it's on the Schedule, and cancelling it asks first and leaves it marked", async ({
  page,
}) => {
  const watch = watchErrors(page);
  await page.goto("/manager/schedule");
  await settle(page);
  const row = page.locator("li").filter({ hasText: title });
  await expect(row).toBeVisible();

  await row.getByText(title).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancel task" }).click();
  await expect(dialog.getByText("Cancel this task?")).toBeVisible();
  await dialog.getByRole("button", { name: "Yes, cancel it" }).click();

  await page.reload();
  await settle(page);
  await expect(row).toContainText("Cancelled");
  expect(watch.errors).toEqual([]);
});
