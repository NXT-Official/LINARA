# Story 5: Invitation and Claim Handshake APIs

## Objective
Implement the digital handshake APIs in Nitro server functions, supporting the safe creation of invitations by managers and secure claiming of accounts by helpers.

## Context References
*   PRD Spec: [`plan.md`](../plan.md) Section 2.1 & 3.1
*   Architecture Spec: [`architecture.md`](../architecture.md) Section 2.1, 6.1, & 7.1

## Dependencies
*   [`Story_4_DatabaseRLSPoliciesAndIsolation.md`](Story_4_DatabaseRLSPoliciesAndIsolation.md)

## Explicit Inputs
*   File: [`architecture.md`](../architecture.md) Section 7.1 (API Schema)

## Step-by-Step Implementation Instructions
1.  **Invite Endpoint:** Build `POST /api/helpers/invite` in a Nitro server function:
    *   Generates a cryptographically secure 6-digit invitation code.
    *   Creates a `PENDING_CLAIM` entry in `helper_profiles` storing the baseline wage, shift hours, and rest day.
2.  **Verify Code Endpoint:** Build `GET /api/helpers/claim/verify`:
    *   Allows lookups of unclaimed invite terms without authentication.
3.  **Claim Endpoint:** Build `POST /api/helpers/claim`:
    *   Allows the helper to set their email and secure password.
    *   Spins up a real Supabase Auth user, assigns their `helper_profiles` relationship, and flags status as `ACTIVE`.
    *   Secures helper password ownership, preventing manager access.

## Expected Output
*   Endpoint: `POST /api/helpers/invite`
*   Endpoint: `GET /api/helpers/claim/verify`
*   Endpoint: `POST /api/helpers/claim`

## Testable Acceptance Criteria
1.  Calling `/api/helpers/invite` creates a 6-character code and stores parameters in the DB.
2.  `/api/helpers/claim/verify?code=INVALID` returns a `404 Not Found` response.
3.  Calling `/api/helpers/claim` with a valid code registers a new user in Supabase Auth, updates profile status, and returns a valid JWT session token.

## Done Definition
The invitation creation, terms verification, and claim-handshake account setup APIs are deployed, fully functional, and tested.
