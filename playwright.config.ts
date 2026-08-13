import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "line",
  use: {
    baseURL: "http://localhost:8080",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // npx resolves to whatever's in node_modules regardless of which
    // package manager installed it -- CI installs via npm (see ci.yml),
    // so a bun-specific command here would fail there.
    command: "npx vite dev",
    url: "http://localhost:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
