# Story 1: Environment Baseline & Dependency Ingestion

## Objective

Establish and verify the local development environment baseline, ensuring proper dependency ingestion, compiler checks, `.gitignore` sanity, and documented environment variables before any application logic or database migration begins. This ensures a stable and secure baseline preserving the pre-existing codebase.

## Context References

- PRD Spec: [`plan.md`](../plan.md) Section 6 (Verification & Simulated Testing)
- Architecture Spec: [`ARCHITECTURE.md`](../ARCHITECTURE.md) Section 11 (Local Deployment Model)
- README: [`README.md`](../README.md) Section 6 (Local Development & Setup)

## Dependencies

- None

## Explicit Inputs

- File: [`package.json`](../package.json)
- File: [`bunfig.toml`](../bunfig.toml)
- File: [`.gitignore`](../.gitignore)
- File: [`.env.example`](../.env.example)

## Step-by-Step Implementation Instructions

1.  **Gitignore Verification:** Audit and update [`.gitignore`](../.gitignore) to ensure it excludes binary logs, node modules, build outputs (`.output`, `.nitro`, `.vinxi`, `.tanstack`, `.wrangler`, `dist`), and local environment files (`.env`, `.env.local`, `.env.production`).
2.  **Dependency Ingestion:** Run the package manager installation (`bun install` or equivalent) to ensure all dependencies in [`package.json`](../package.json) are downloaded and locked in the local environment.
3.  **Environment Variable Documentation:**
    - Verify [`.env.example`](../.env.example) has all the required keys (e.g., `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `JWT_SECRET`, `SYSTEM_CRON_SECRET`, `REGIONAL_MINIMUM_WAGE`).
    - Create a local `.env` file by copying [`.env.example`](../.env.example) and filling in valid local development dummy credentials.
4.  **Preservation Check:** Scan the pre-existing codebase structure (e.g., folders inside `src/features/` and the routes inside `src/routes/`) to verify that the modularized features and structure are intact and recognized.
5.  **Local Compiler Check:** Run the local compiler check (`bun run build` or equivalent) to compile the pre-existing assets and verify that the current code translates into a production build without any warnings or failures.

## Expected Output

- Updated File: [`.gitignore`](../.gitignore)
- New File: `.env` (populated with local development coordinates)
- Successful build outputs in `.output/` (server) and `.output/public/` (client assets)

## Testable Acceptance Criteria

1.  The command `bun run build` compiles the application successfully with exit code `0`.
2.  The `.env` file is present in the workspace root, containing non-empty keys for local development coordinates.
3.  `git status` does not list `.env` or `node_modules` or `.output` as untracked files, proving that the updated [`.gitignore`](../.gitignore) is functioning correctly.

## Done Definition

All environment variables are documented and active, the package manager has successfully locked and loaded all dependencies, the compiler check finishes with exit code `0`, and the `.gitignore` safely screens system logs, environment variables, and build outputs.
