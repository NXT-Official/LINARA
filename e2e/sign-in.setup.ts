import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { expect, test as setup } from "@playwright/test";

import { AUTH_FILE } from "../playwright.config";
import { HAS_MANAGER, MANAGER_EMAIL, MANAGER_PASSWORD } from "./helpers";

/**
 * Signs the test manager in once and saves the session (it lives in
 * localStorage) for every signed-in test. Without credentials it saves an
 * empty session, and the signed-in tests skip themselves.
 */
setup("sign in as the test manager", async ({ page }) => {
  if (!HAS_MANAGER) {
    mkdirSync(dirname(AUTH_FILE), { recursive: true });
    writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }
  await page.goto("/login");
  await page.getByLabel("Email").fill(MANAGER_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(MANAGER_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/manager\/pass/, { timeout: 60_000 });
  await page.context().storageState({ path: AUTH_FILE });
});
