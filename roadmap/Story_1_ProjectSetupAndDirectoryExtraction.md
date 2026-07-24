# Story 1: Project Setup and Directory Extraction

## Objective
Establish the environment variable structures, local configurations, and create dedicated directories for frontend modularization and feature extraction.

## Context References
*   PRD Spec: [`plan.md`](../plan.md) Section 1 & 6
*   Architecture Spec: [`architecture.md`](../architecture.md) Section 3.1 & 11
*   Legacy Spec: [`original-ARCHITECTURE.md`](../original-ARCHITECTURE.md) Section 2 & 7

## Dependencies
*   None

## Explicit Inputs
*   File: [`package.json`](../package.json)
*   File: [`bunfig.toml`](../bunfig.toml)

## Step-by-Step Implementation Instructions
1.  **Environment Setup:** Create a `.env` file in the root workspace directory by duplicating the local parameters defined in [`architecture.md`](../architecture.md) Section 11. Include `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `JWT_SECRET`, and `REGIONAL_MINIMUM_WAGE`.
2.  **Create Directory Structure:** Create folders representing isolated business features under `src/features/`:
    *   `src/features/board/`
    *   `src/features/people//`
    *   `src/features/shifts/`
    *   `src/features/ledger/`
    *   `src/features/pantry/`
    *   `src/features/utos/`
    *   `src/features/notes/`
    *   `src/features/invites/`
3.  **Validate Compilation:** Execute a dev build compiler check to verify the workspace builds without anomalies.

## Expected Output
*   File: `.env` (contains target env parameters)
*   Directories: `src/features/*` (8 empty feature folders ready for modular file placements)

## Testable Acceptance Criteria
1.  The command `bun run build` executes and finishes with exit code `0`.
2.  The `.env` file is present in the workspace root, containing non-empty keys for local development coordinates.
3.  The directory paths for all 8 custom features are verified as present.

## Done Definition
All target environment parameters are configured and active, feature extraction folders are present, and the workspace compiles without build warnings.
