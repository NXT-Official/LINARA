import { defineConfig, devices } from "@playwright/test";

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
 *
 * The signed-in checks read and open dialogs; they don't save, delete, or
 * pay (e2e/manager.spec.ts says what each one touches).
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
      use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
      dependencies: ["sign-in"],
    },
    {
      name: "phone",
      use: { ...devices["Pixel 7"], storageState: AUTH_FILE },
      dependencies: ["sign-in"],
    },
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
