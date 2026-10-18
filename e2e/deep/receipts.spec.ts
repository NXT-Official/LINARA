import { expect, test } from "@playwright/test";

import { HAS_MANAGER, settle, watchErrors } from "../helpers";
import { listEvidence, removeReceiptsSince, session } from "./cleanup";

/**
 * A manager who did the shopping adds the receipt from the web (KNOWN_GAPS
 * O29): the photo and its thumbnail land in household-evidence under
 * "<household>/receipts/", a grocery_receipts row points at the photo, and
 * the receipt shows in the list. Both are deleted afterwards.
 */
test.skip(!HAS_MANAGER, "Set E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD to run these.");

// A 1x1 PNG: the page shrinks and re-encodes whatever it's given to JPEG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const receiptsDir = () => `${session().householdId}/receipts`;

const started = new Date(Date.now() - 60_000).toISOString();

test.afterAll(async () => {
  await removeReceiptsSince(started);
});

test("a manager adds a receipt, and it's stored with its thumbnail", async ({ page }) => {
  const watch = watchErrors(page);
  await page.goto("/manager/pantry");
  await settle(page);
  const groceries = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Grocery list", exact: true }) });
  await expect(groceries.getByRole("button", { name: "Add receipt" })).toBeVisible();

  await groceries
    .locator('input[type="file"]')
    .setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Receipt added")).toBeVisible();
  await expect(groceries.getByRole("button", { name: /tap to view/ }).first()).toBeVisible();

  const before = await listEvidence(receiptsDir());
  const paths = await removeReceiptsSince(started);
  expect(paths).toHaveLength(1);
  const file = paths[0].split("/").pop() ?? "";
  expect(file).toMatch(/^\d+\.jpg$/);
  expect(before).toEqual(expect.arrayContaining([file, file.replace(".jpg", ".thumb.jpg")]));
  expect(await listEvidence(receiptsDir())).not.toContain(file);
  expect(watch.errors).toEqual([]);
});
