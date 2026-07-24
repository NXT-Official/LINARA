# Story 3: Database Initialization and Core Tables

## Objective
Establish the relational PostgreSQL database schemas inside the Supabase instance, defining constraints, keys, indexes, and defaults that align perfectly with the types inside [`src/routes/index.tsx`](../src/routes/index.tsx).

## Context References
*   PRD Spec: [`plan.md`](../plan.md) Section 3
*   Architecture Spec: [`architecture.md`](../architecture.md) Section 8 & 8.1
*   Legacy Spec: [`original-ARCHITECTURE.md`](../original-ARCHITECTURE.md) Section 4

## Dependencies
*   [`Story_2_CodebaseAuditAndBaselineVerification.md`](Story_2_CodebaseAuditAndBaselineVerification.md)

## Explicit Inputs
*   File: [`architecture.md`](../architecture.md) Section 8.1 (Full SQL Schema)

## Step-by-Step Implementation Instructions
1.  **Run SQL Schemas:** Execute the SQL script defined in Section 8.1 of `architecture.md` on the Supabase/PostgreSQL instance.
2.  **Verify Constraints:** Ensure check constraints match exactly:
    *   `helper_profiles.station` constraint checks: `'Yaya'`, `'Cook'`, `'Laundry'`, `'Driver'`, `'House'`.
    *   `tickets.status` constraint checks: `'todo'`, `'in_progress'`, `'done'`, `'blocked'`.
    *   `quick_utos.ack_state` constraint checks: `'sent'`, `'seen'`, `'done'`.
    *   `pantry_items.category` constraint checks: `'Rice & grains'`, `'Fresh'`, `'Baby'`, `'Cleaning'`, `'Pantry'`.
3.  **Create Indexes:** Add indexes on search/query-heavy keys to speed up loader queries:
    *   `tickets(household_id, helper_id)`
    *   `helper_profiles(invite_code)`
    *   `quick_utos(recipient_id, created_at)`

## Expected Output
*   Active PostgreSQL tables in database schema `public` containing:
    *   `user_profiles`
    *   `helper_profiles`
    *   `house_sops`
    *   `tickets`
    *   `appointments`
    *   `ledger_entries`
    *   `vales`
    *   `pantry_items`
    *   `grocery_items`
    *   `quick_utos`
    *   `helper_notes`

## Testable Acceptance Criteria
1.  Attempting to insert a helper profile with role `'cleaner'` fails the constraint check (must be station `'Laundry'` or `'House'`).
2.  Inserting a ticket with status `'QUEUED'` fails (must use backwards-compatible `'todo'`).
3.  All foreign key mappings succeed and prevent orphaned row creation.

## Done Definition
The PostgreSQL relational schemas are initialized, indices are generated, and constraint rules validate correctly against backwards-compatible prototype models.
