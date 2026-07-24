# Story 4: Database RLS Policies and Isolation

## Objective
Enforce strict security boundaries at the PostgreSQL layer using Supabase Row-Level Security (RLS) policies, separating data access by `household_id` and guaranteeing the privacy of helper-private notes.

## Context References
*   PRD Spec: [`plan.md`](../plan.md) Section 1.2 & 2.4
*   Architecture Spec: [`architecture.md`](../architecture.md) Section 4.2 & 5.2

## Dependencies
*   [`Story_3_DatabaseInitializationAndCoreTables.md`](Story_3_DatabaseInitializationAndCoreTables.md)

## Explicit Inputs
*   File: [`architecture.md`](../architecture.md) Section 5.2 (Row-Level Security)

## Step-by-Step Implementation Instructions
1.  **Enable RLS:** Activate Row-Level Security on all 11 core tables created in Story 3.
2.  **Define Household RLS Policy:** Write the standard security filter to isolate data by `household_id`:
    *   Only users with matching `household_id` in their `user_profiles` record can SELECT, INSERT, UPDATE, or DELETE from general operational tables.
3.  **Define Private Note RLS Policy:** Set the strict privacy fence around `helper_notes`:
    *   Only the helper whose profile references `auth.uid()` can read, write, or update their notes. Ensure that managers or system queries are rejected at the DB layer.
4.  **Grant Table Roles:** Verify SELECT/INSERT/UPDATE permissions are explicitly granted to appropriate web role consumers.

## Expected Output
*   Security policies applied on PostgreSQL schema.
*   Database logs confirming query isolation.

## Testable Acceptance Criteria
1.  Querying `tickets` as a user from Household A returns zero rows from Household B.
2.  An authenticated manager attempting to query the `helper_notes` table throws an RLS access violation error.
3.  An authenticated helper can read, insert, and delete their own private note records.

## Done Definition
All 11 operational tables have active RLS policies, household data isolation is secured, and the privacy boundary around helper notes is programmatically locked.
