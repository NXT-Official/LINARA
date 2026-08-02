# Linara Home — Master Execution Plan

This document outlines the step-by-step sequential implementation roadmap to transition the Linara front-end prototype into a production-ready, full-stack application. It synthesizes product requirements from [`plan.md`](plan.md), technical structures from [`architecture.md`](architecture.md), and behavioral AI agent models from [`aiagent.md`](aiagent.md).

All stories account for the **CRITICAL PRE-EXISTING CONTEXT PRIORITY**, verifying that we integrate, migrate, and preserve pre-existing patterns inside [`src/routes/index.tsx`](src/routes/index.tsx) rather than building from a greenfield.

---

## Roadmap Structure & Phases

The execution plan is split into 6 structured, independent, and sequential phases:

### Phase 1: Setup, DevSecOps, & Pre-Flight Bootstrapping
*   **[completed] [`Story_1_EnvironmentBaselineAndDependencyIngestion.md`](roadmap/Story_1_EnvironmentBaselineAndDependencyIngestion.md):** Establish local environment files, update gitignore boundaries, run clean dependency checks, and verify compiler baseline.
*   **[completed] [`Story_2_SASTToolingAndCIDCPipelineSetup.md`](roadmap/Story_2_SASTToolingAndCIDCPipelineSetup.md):** Configure ESLint security rule engines (SAST), audit code quality rules, and establish automated pull request CI/CD pipeline triggers.

### Phase 2: Backend Core
*   **[completed] [`Story_3_DatabaseInitializationAndCoreTables.md`](roadmap/Story_3_DatabaseInitializationAndCoreTables.md):** Migration schemas for PostgreSQL tables matching prototype properties.
*   **[completed] [`Story_4_DatabaseRLSPoliciesAndIsolation.md`](roadmap/Story_4_DatabaseRLSPoliciesAndIsolation.md):** Row-Level Security policies isolating profiles by `household_id` and securing notes.
*   **[completed] [`Story_5_InvitationAndClaimHandshakeAPIs.md`](roadmap/Story_5_InvitationAndClaimHandshakeAPIs.md):** Single-use invitation generation, verification, and claimant password-lock APIs (implemented via type-safe TanStack Server Functions).

### Phase 3: Frontend Core
*   **[completed] [`Story_6_ModularFrontendFeatureExtraction.md`](roadmap/Story_6_ModularFrontendFeatureExtraction.md):** Partitioning index.tsx into modular features directories under `src/features/`.
*   **[`Story_7_AuthAndClaimOnboardingScreens.md`](roadmap/Story_7_AuthAndClaimOnboardingScreens.md):** Connecting claim review terms and password-setup screens to backend endpoints.
*   **[`Story_8_DashboardsPassAndStation.md`](roadmap/Story_8_DashboardsPassAndStation.md):** Implementing the visual Pass layout (Line/Board lane toggling) and the Station focused ticket page.
*   **[completed] [`Story_9_PantryAndPalengkeSharedContext.md`](roadmap/Story_9_PantryAndPalengkeSharedContext.md):** Synchronizing low-par pantry suggest logs with Palengke Run checklists via `GroceryCtx`.

### Phase 4: AI Intelligence
*   **[`Story_10_AISOPGeneratorEdgeFunction.md`](roadmap/Story_10_AISOPGeneratorEdgeFunction.md):** Developing and deploying the House Standard SOP creator with strict schema checks.
*   **[`Story_11_AITemporalSchedulerEdgeFunction.md`](roadmap/Story_11_AITemporalSchedulerEdgeFunction.md):** Creating natural language scheduler engines to compute appointment offsets.
*   **[`Story_12_AIUtosRoutingEdgeFunction.md`](roadmap/Story_12_AIUtosRoutingEdgeFunction.md):** Deploying the context-router with shift boundary warnings.

### Phase 5: Interaction
*   **[`Story_13_RealtimeSynchronizationChannels.md`](roadmap/Story_13_RealtimeSynchronizationChannels.md):** Subscribing client components to real-time database modifications via Supabase Channels.
*   **[`Story_14_OfflineFirstSyncQueue.md`](roadmap/Story_14_OfflineFirstSyncQueue.md):** Constructing offline IndexedDB caches for completing tickets and caching receipt photos.
*   **[`Story_15_AfterHoursFrictionGatingAndLedger.md`](roadmap/Story_15_AfterHoursFrictionGatingAndLedger.md):** Building out-of-shift confirmation dialog gates and automatic rest-accrual ledgers.

### Phase 6: Polish
*   **[`Story_16_ComplianceAuditWagesAndFintechPreviews.md`](roadmap/Story_16_ComplianceAuditWagesAndFintechPreviews.md):** Integrating Batas Kasambahay contribution tables, visual dials, and GCash previews.
*   **[`Story_17_VisualCSSPolishingAndPWAReadiness.md`](roadmap/Story_17_VisualCSSPolishingAndPWAReadiness.md):** Loading custom Fraunces & Nunito Sans fonts, adding CSS transitions, and configuring PWA manifests.

---

## Gantt & Dependency Matrix

The sequential execution flow maps dependencies to prevent integration blockers:

```
P1 (Setup)   ─► Story 1 & 2
                 │
                 ▼
P2 (Backend) ─► Story 3 ─► Story 4 ─► Story 5
                 │
                 ▼
P3 (Frontend)─► Story 6 ─► Story 7 ─► Story 8 ─► Story 9
                 │                                 │
                 ▼                                 ▼
P4 (AI Intel)─► Story 10 ─────────► Story 11 ────► Story 12
                 │                                 │
                 ▼                                 ▼
P5 (Interact)─► Story 13 ─────────► Story 14 ────► Story 15
                 │
                 ▼
P6 (Polish)  ─► Story 16 ─────────► Story 17
```

---

## Critical Development Directives
1.  **Do Not Break the Prototype:** Ensure that the application runs locally and compiles at the end of each story. Maintain simulated state controls (`simOffsetMs`) so offline features can be demoed seamlessly.
2.  **Strict File Boundaries:** Do not let features query databases directly if they should be isolated (e.g. `helper_notes` must use owner auth).
3.  **Cultural Design Consistency:** In-app terminology, error toasts, and loading screens must use warm, clean Taglish phrases. Avoid dry, corporate verbs.
4.  **No Greenfield Assumptions:** Always inspect pre-existing code layouts inside [`src/routes/index.tsx`](src/routes/index.tsx) for functions or components that can be reused rather than written from scratch.
