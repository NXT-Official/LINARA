# Story 2: Codebase Audit and Baseline Verification

## Objective
Audit the existing monolithic `src/routes/index.tsx` prototype, isolate the simulated clock utility (`simOffsetMs`), and set up a baseline testing harness to prevent regression during modular refactoring.

## Context References
*   PRD Spec: [`plan.md`](../plan.md) Section 2.4 & 4
*   Architecture Spec: [`architecture.md`](../architecture.md) Section 6.1 & 9.1
*   Legacy Spec: [`original-ARCHITECTURE.md`](../original-ARCHITECTURE.md) Section 4 & 6

## Dependencies
*   [`Story_1_ProjectSetupAndDirectoryExtraction.md`](Story_1_ProjectSetupAndDirectoryExtraction.md)

## Explicit Inputs
*   File: [`src/routes/index.tsx`](../src/routes/index.tsx)
*   Variable: `simOffsetMs` (tracks simulated timeline in code)

## Step-by-Step Implementation Instructions
1.  **Isolate Clock Logic:** Extract the simulated timezone/clock calculation from [`src/routes/index.tsx`](../src/routes/index.tsx) into a shared utility file `src/lib/clock-utils.ts` to allow testing across modules.
2.  **Build Verification Suite:** Configure a basic vitest configuration or equivalent testing harness in `package.json` to verify date offsets work correctly when pushing simulated time into the future (e.g. crossing the `QUIET_START_HOUR` at 10 PM).
3.  **Verify Baseline Compilation:** Ensure the application mounts on the browser successfully with the clock utility successfully referenced.

## Expected Output
*   File: `src/lib/clock-utils.ts` (exports `ClockState` computation helpers)
*   File: `src/lib/clock-utils.test.ts` (unit tests checking simulated offsets)

## Testable Acceptance Criteria
1.  `clock-utils.test.ts` executes and passes when running `bun test`.
2.  Adjusting `simOffsetMs` successfully offsets the clock displayed on the global landing page without page reloads.

## Done Definition
The simulated timeline offset utility is isolated, has unit test coverage for timezone boundaries, and the baseline application builds successfully.
