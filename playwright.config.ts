import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// The test accounts, kept out of git by .gitignore's `.env.*`. Variables
// already set in the shell win.
if (existsSync(".env.e2e")) process.loadEnvFile(".env.e2e");

/**
 * Browser QA (QA, 2026-10-02: the client's Playwright crawl found what unit
 * tests couldn't). `npm run test:e2e`.
 *
 * - E2E_BASE_URL: the site to test. Unset, it starts `npm run dev` on 8080
 *   (or reuses one already there). A dev server hides production-only UI
 *   such as the Offline badge, so point it at a built preview or the
 *   deployed site before a release.
 * - E2E_MANAGER_EMAIL / E2E_MANAGER_PASSWORD: a test manager account. Without
 *   them only the signed-out checks run. Never commit them.
 * - E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD: a house-staff account, for the
 *   check that staff are sent to the app, not the dashboard.
 * - Any of these can go in .env.e2e (gitignored) instead of the shell.
 *
 * The signed-in checks read and open dialogs; they don't save, delete, or
 * pay (e2e/manager.spec.ts says what each one touches). The exception is
 * e2e/deep, which only runs with E2E_DEEP=1 (e2e/deep/cleanup.ts).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const AUTH_FILE = "test-results/.auth/manager.json";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "sign-in", testMatch: /sign-in\.setup\.ts/ },
    {
      name: "desktop",
      testIgnore: /deep\//,
      use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
      dependencies: ["sign-in"],
    },
    {
      name: "phone",
      testIgnore: /deep\//,
      use: { ...devices["Pixel 7"], storageState: AUTH_FILE },
      dependencies: ["sign-in"],
    },
    // e2e/deep writes to the test household (and deletes it again), so only
    // when asked (E2E_DEEP=1, npm run qa:deep), and once: desktop only.
    ...(process.env.E2E_DEEP
      ? [
          {
            name: "deep",
            testMatch: /deep\/.*\.spec\.ts/,
            use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
            dependencies: ["sign-in"],
          },
        ]
      : []),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- --port 8080 --strictPort",
        url: `${baseURL}/login`,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});

export { AUTH_FILE };
