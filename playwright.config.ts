import { defineConfig, devices } from "@playwright/test";

import { startMockSupabaseServer } from "./tests/support/mock-supabase-server";

// Started once when this config is loaded, before webServer spawns --
// SUPABASE_URL below points the app's server functions at it instead of
// the real, shared Supabase project. See tests/support/mock-supabase-server.ts.
const MOCK_SUPABASE_PORT = 4319;
startMockSupabaseServer(MOCK_SUPABASE_PORT).catch((err) => {
  console.error("[mock-supabase-server] failed to start:", err);
});

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
    env: {
      SUPABASE_URL: `http://127.0.0.1:${MOCK_SUPABASE_PORT}`,
      SUPABASE_ANON_KEY: "mock-anon-key-for-e2e",
    },
  },
});
