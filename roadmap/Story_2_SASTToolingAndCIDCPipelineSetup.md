# Story 2: SAST Tooling & CI/CD Pipeline Setup

## Objective

Configure and verify the Static Application Security Testing (SAST) linting engine using ESLint, and set up/verify the base CI/CD pipeline that automatically executes quality, security, type-checking, and build validation checks on branch pull requests.

## Context References

- PRD Spec: [`plan.md`](../plan.md) Section 5 (Explicit Integrations & Security Boundaries)
- Architecture Spec: [`ARCHITECTURE.md`](../ARCHITECTURE.md) Section 1.2 (Tech Stack) & Section 4.2 (Security Boundaries & Multi-Tenant Isolation)
- Lint Configuration: [`eslint.config.js`](../eslint.config.js)

## Dependencies

- [`Story_1_EnvironmentBaselineAndDependencyIngestion.md`](Story_1_EnvironmentBaselineAndDependencyIngestion.md)

## Explicit Inputs

- File: [`package.json`](../package.json)
- File: [`eslint.config.js`](../eslint.config.js)
- File: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

## Step-by-Step Implementation Instructions

1.  **SAST Linting Configuration:**
    - Audit [`eslint.config.js`](../eslint.config.js) to ensure rules are defined to prevent dynamic code execution (`no-eval`, `no-implied-eval`), guard against Cross-Site Scripting (XSS), prevent Type Evasion bugs (`@typescript-eslint/no-explicit-any`), flag unused parameters, and block unsafe RegExp constructs to prevent Regular Expression Denial of Service (ReDoS).
    - Validate that `npm run lint` or `bun run lint` maps to ESLint execution in [`package.json`](../package.json).
2.  **CI/CD Pipeline Verification:**
    - Inspect/configure [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) to ensure it targets `push` and `pull_request` events to `main` and `master` branches.
    - Confirm the CI/CD pipeline includes the following execution steps:
      1. Checkout repository.
      2. Set up Node.js/Bun runtime.
      3. Install package dependencies cleanly (`npm ci` or equivalent).
      4. Check formatting (`npx prettier --check .`).
      5. Run SAST linting scans (`npm run lint`).
      6. Enforce TypeScript type validation (`npx tsc --noEmit` or equivalent).
      7. Run production compile checks (`npm run build`).
3.  **Harness Verification:**
    - Execute the lint scanner locally with `bun run lint` (or `npm run lint`) to ensure it runs cleanly across the codebase.
    - Introduce a minor lint/type check violation temporarily (e.g. `no-eval` or type evasion) to verify the engine correctly intercepts and flags secure code issues.

## Expected Output

- Audited File: [`eslint.config.js`](../eslint.config.js) (SAST security rules configured and verified)
- Audited File: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (CI/CD workflows executing on branch pull requests)

## Testable Acceptance Criteria

1.  The command `bun run lint` (or equivalent) scans the codebase and returns exit code `0` on clean code.
2.  Intentionally adding `eval("console.log(1)")` in a code file is flagged as an error by the lint script.
3.  The CI/CD pipeline in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) triggers on all pull requests targeting main branches, running tests, lint checks, type checks, and production compilations.

## Done Definition

Static Application Security Testing (SAST) rules are actively guarding the codebase, linting checks fail on security violations, and the CI/CD pipeline triggers on branch pull requests to enforce compilation and linting verification automatically.
