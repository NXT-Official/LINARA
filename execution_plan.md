# Linara Home: Core Master Execution Plan

This roadmap outlines the sequential, step-by-step technical implementation to transition the Linara front-end prototype into a production-ready, full-stack application. It synthesizes product requirements from [`plan.md`](plan.md), system structures from [`architecture.md`](architecture.md), and behavioral configurations from [`aiagent.md`](aiagent.md).

All tasks strictly respect the **CRITICAL PRE-EXISTING CONTEXT PRIORITY**, ensuring we integrate, migrate, and preserve established patterns inside [`src/routes/index.tsx`](src/routes/index.tsx) rather than writing greenfield code.

---

## Roadmap Phases & Milestones

The execution roadmap is divided into six independent, sequential phases:

### Phase 1: Infrastructure, DevSecOps, & Pre-Flight Setup

- **[completed] [`Story_1_EnvironmentBaselineAndDependencyIngestion.md`](roadmap/Story_1_EnvironmentBaselineAndDependencyIngestion.md):** Configure local environment templates, set up gitignore rules, run clean package audits, and verify build tooling.
- **[completed] [`Story_2_SASTToolingAndCIDCPipelineSetup.md`](roadmap/Story_2_SASTToolingAndCIDCPipelineSetup.md):** Establish ESLint security rules (SAST), verify code standards, and set up automated pull-request CI/CD checks.

### Phase 2: Core Database & APIs

- **[completed] [`Story_3_DatabaseInitializationAndCoreTables.md`](roadmap/Story_3_DatabaseInitializationAndCoreTables.md):** Migration schema definitions for Postgres tables aligning with prototype properties.
- **[completed] [`Story_4_DatabaseRLSPoliciesAndIsolation.md`](roadmap/Story_4_DatabaseRLSPoliciesAndIsolation.md):** Define Row-Level Security (RLS) policies to isolate profiles by `household_id` and protect sensitive helper notes.
- **[completed] [`Story_5_InvitationAndClaimHandshakeAPIs.md`](roadmap/Story_5_InvitationAndClaimHandshakeAPIs.md):** Implement single-use invitations, secure claims, and profile lock APIs using type-safe TanStack Server Functions.

### Phase 3: Client Features & Layouts

- **[completed] [`Story_6_ModularFrontendFeatureExtraction.md`](roadmap/Story_6_ModularFrontendFeatureExtraction.md):** Partition components in index.tsx into modular features directories under `src/features/`.
- **[completed] [`Story_7_AuthAndClaimOnboardingScreens.md`](roadmap/Story_7_AuthAndClaimOnboardingScreens.md):** Bind onboarding screens and claim reviews to secure backend endpoints.
- **[completed] [`Story_8_DashboardsPassAndStation.md`](roadmap/Story_8_DashboardsPassAndStation.md):** Build the responsive visual Pass view (Board vs. Line layout toggles) and the focused Station detail page.
- **[completed] [`Story_9_PantryAndPalengkeSharedContext.md`](roadmap/Story_9_PantryAndPalengkeSharedContext.md):** Sync low-par pantry thresholds with Palengke Run task lists via `GroceryCtx`.
- **[completed] [`Story_9_5_TestingFrameworkAndE2ESmokeSetup.md`](roadmap/Story_9_5_TestingFrameworkAndE2ESmokeSetup.md):** Install Vitest and Playwright test suites alongside baseline onboarding smoke tests.

### Phase 4: AI Engine Integration

- **[completed] [`Story_10_AISOPGeneratorEdgeFunction.md`](roadmap/Story_10_AISOPGeneratorEdgeFunction.md):** Build and deploy the House Standard SOP generator utilizing structured JSON validation.
- **[completed] [`Story_11_AITemporalSchedulerEdgeFunction.md`](roadmap/Story_11_AITemporalSchedulerEdgeFunction.md):** Create natural language date-parsing utilities to calculate recurring household tasks.
- **[completed] [`Story_12_AIUtosRoutingEdgeFunction.md`](roadmap/Story_12_AIUtosRoutingEdgeFunction.md):** Deploy task routers with smart notifications warning of out-of-shift boundaries.

### Phase 5: Interactive Sync & State

- **[completed] [`Story_13_RealtimeSynchronizationChannels.md`](roadmap/Story_13_RealtimeSynchronizationChannels.md):** Connect front-end clients to live database changes using secure Supabase Realtime Channels.
- **[completed] [`Story_14_OfflineFirstSyncQueue.md`](roadmap/Story_14_OfflineFirstSyncQueue.md):** Implement offline IndexedDB cache layers to allow ticket updates and handle local image caches.
- **[completed] [`Story_15_AfterHoursFrictionGatingAndLedger.md`](roadmap/Story_15_AfterHoursFrictionGatingAndLedger.md):** Build confirmation modals for late task updates and support automatic overtime logging.

### Phase 6: Compliance & Polish

- **[completed] [`Story_16_ComplianceAuditWagesAndFintechPreviews.md`](roadmap/Story_16_ComplianceAuditWagesAndFintechPreviews.md):** Integrate Batas Kasambahay compliance tables, UI dials, and GCash/Maya transfer previews.
- **[completed] [`Story_17_VisualCSSPolishingAndPWAReadiness.md`](roadmap/Story_17_VisualCSSPolishingAndPWAReadiness.md):** Load custom brand typography, inject responsive CSS transitions, and configure local progressive web app (PWA) manifest files.

---

## Dependency & Execution Order

To prevent integration blocks, tasks should be executed according to the following phase dependencies:

1. **Infrastructure (Phase 1)**
   - Starts with _Story 1_ & _Story 2_
2. **Database & APIs (Phase 2)**
   - Requires Phase 1
   - Sequential Flow: _Story 3_ ➔ _Story 4_ ➔ _Story 5_
3. **Client Layouts (Phase 3)**
   - Requires Phase 2
   - Sequential Flow: _Story 6_ ➔ _Story 7_ ➔ _Story 8_ ➔ _Story 9_ ➔ _Story 9.5_
4. **AI Capabilities (Phase 4)**
   - Requires Phase 3
   - Sequential Flow: _Story 10_ ➔ _Story 11_ ➔ _Story 12_
5. **State Synchronization (Phase 5)**
   - Requires Phase 3 & 4
   - Sequential Flow: _Story 13_ ➔ _Story 14_ ➔ _Story 15_
6. **Polishing & Compliance (Phase 6)**
   - Requires Phase 5
   - Sequential Flow: _Story 16_ ➔ _Story 17_

---

## Critical Development Directives

1. **Keep the Prototype Running:** Ensure the local build compiles at the end of every story. Keep the offline simulator utility (`simOffsetMs`) intact so local evaluations can run uninterrupted.
2. **Enforce File and Isolation Boundaries:** Never allow standard clients to fetch database details directly if they bypass access policies (e.g., `helper_notes` must remain guarded behind owner profiles).
3. **Maintain Local Cultural Tone:** In-app terminology, helpful warnings, and status toasts should utilize warm, clear Taglish wording. Avoid cold, dry, corporate phrasing.
4. **Leverage Pre-existing Assets:** Do not code from scratch. Always inspect the pre-existing code inside [`src/routes/index.tsx`](src/routes/index.tsx) to identify utility functions or layouts that can be reused.
