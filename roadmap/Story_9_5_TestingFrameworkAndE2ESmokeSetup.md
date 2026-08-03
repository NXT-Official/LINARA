# Story 9.5: Testing Framework & E2E Smoke Setup

## Objective
Install, configure, and verify both Vitest (for unit/integration testing) and Playwright (for end-to-end browser-based smoke testing) to ensure continuous quality gates inside our local environment and CI/CD workflows.

## Context References
*   PRD Spec: [`plan.md`](../plan.md) Section 6 (Verification & Simulated Testing)
*   CI/CD Config: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
*   Project Manifest: [`package.json`](../package.json)

## Dependencies
*   [`Story_9_PantryAndPalengkeSharedContext.md`](Story_9_PantryAndPalengkeSharedContext.md)

## Explicit Inputs
*   File: [`package.json`](../package.json)
*   File: [`vite.config.ts`](../vite.config.ts) (or your Vite configuration file)

## Step-by-Step Implementation Instructions

1.  **Install Test Dependencies:**
    Run the following command to ingest the testing suites:
    ```bash
    bun add -d vitest @testing-library/react @testing-library/jest-dom jsdom @playwright/test
    ```
2.  **Configure Vitest:**
    *   Create `vitest.config.ts` (or extend your Vite config) to set up the `jsdom` testing environment:
        ```typescript
        import { defineConfig } from 'vitest/config';
        import react from '@vitejs/plugin-react';

        export default defineConfig({
          plugins: [react()],
          test: {
            environment: 'jsdom',
            globals: true,
            setupFiles: './src/test/setup.ts',
          },
        });
        ```
    *   Create a base setup file `src/test/setup.ts` importing `@testing-library/jest-dom`.
3.  **Configure Playwright:**
    *   Initialize Playwright config by running `bunx playwright install --with-deps` or creating a standard `playwright.config.ts` targeting the local development server `http://localhost:3000`.
4.  **Register Run Scripts:**
    In `package.json:scripts`, append the following execution entries:
    ```json
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
    ```
5.  **Write Initial Smoke Tests:**
    *   *Unit Test:* Create `src/lib/time.test.ts` to test time helper utilities (e.g. validating shift hour computations).
    *   *E2E Test:* Create `tests/claims-smoke.spec.ts` to boot the headless browser, visit `/`, and verify that the invitation claim onboarding terms render without throwing frontend script exceptions.

## Expected Output
*   Config: `vitest.config.ts` and `playwright.config.ts`
*   Script hooks inside [`package.json`](../package.json)
*   Pass/fail results of `bun run test` and `bun run test:e2e`

## Testable Acceptance Criteria
1.  Running `bun run test` executes successfully, finding and passing the time helper unit test.
2.  Running `bun run test:e2e` launches a headless browser and verifies `/` loads correctly.
3.  Integrating these scripts into the GitHub Actions CI ensures that a pull request fails if any unit or smoke tests are broken.

## Done Definition
Testing dependencies are installed, configuration runners are integrated, and initial unit/E2E tests pass successfully both locally and inside the CI runtime.
