import { expect, test } from "@playwright/test";

import { HAS_MANAGER, settle, watchErrors } from "../helpers";

/**
 * A manager invite code made for real and cancelled again (KNOWN_GAPS O2,
 * supabase/add-household-managers.sql). Nobody claims it, so the household's
 * managers don't change. A cancelled code stays in manager_invites as
 * revoked: the table has no delete for app users, and the row is harmless.
 */
test.skip(!HAS_MANAGER, "Set E2E_MANAGER_EMAIL and E2E_MANAGER_PASSWORD to run these.");

test("a manager code is made, listed, and cancelled", async ({ page }) => {
  const watch = watchErrors(page);
  await page.goto("/manager/people");
  await settle(page);
  await page.getByRole("button", { name: /Invite a manager/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Remote admin/ }).check();
  await dialog.getByRole("button", { name: "Make a code" }).click();
  await expect(dialog.getByRole("heading", { name: "Share this code" })).toBeVisible();
  const code = (await dialog.locator(".font-display.text-4xl").innerText()).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  await dialog.getByRole("button", { name: "Done" }).click();

  const row = page
    .locator("div")
    .filter({ hasText: code })
    .filter({ hasText: "Cancel code" })
    .last();
  await expect(row).toContainText("Remote admin");
  await row.getByRole("button", { name: "Cancel code" }).click();
  await expect(page.getByText(code)).toHaveCount(0);

  await page.reload();
  await settle(page);
  await expect(page.getByText(code)).toHaveCount(0);
  expect(watch.errors).toEqual([]);
});
