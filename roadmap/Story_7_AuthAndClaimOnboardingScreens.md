# Story 7: Auth and Claim Onboarding Screens

## Objective
Connect the invitation claimant interface screens (`ClaimAccountFlow`, `ClaimedWelcome`) to the newly created handshake API endpoints, ensuring helpers can verify details and securely activate their own accounts.

## Context References
*   PRD Spec: [`plan.md`](../plan.md) Section 2.1 & 3.1
*   Architecture Spec: [`architecture.md`](../architecture.md) Section 2.1, 4.1, & 7.1

## Dependencies
*   [`Story_6_ModularFrontendFeatureExtraction.md`](Story_6_ModularFrontendFeatureExtraction.md)

## Explicit Inputs
*   Component: `ClaimAccountFlow` in code
*   File: `src/features/people/` (onboarding components)

## Step-by-Step Implementation Instructions
1.  **Code Lookup Bind:** Wire the 6-digit input text fields inside `ClaimAccountFlow` to query `GET /api/helpers/claim/verify?code=...`.
2.  **Display Audit Screen:** If the invitation code is valid, parse the returned terms payload (base wage rate, shift start/end, and rest-day) and render them in a clear, high-contrast, read-only "Transparency Audit" panel.
3.  **Integrate Registration Lock:** Bind the "Lock Account" confirmation form to submit the helper's chosen password and email to the `POST /api/helpers/claim` endpoint.
4.  **Manage Local Sessions:** Upon a successful response, save the returned JWT session token to local credentials and navigate the user directly into their personalized "Worker Station" today view.

## Expected Output
*   Interactive Claim Code entry page with error handling toasts.
*   Transparency Audit card displaying wage and shift conditions.
*   Functional registration locking system redirecting to the Station dashboard.

## Testable Acceptance Criteria
1.  Entering a valid invitation code displays the correct, read-only wage in Philippine Pesos (₱) and shift hours.
2.  Tapping "Something's not right?" triggers a dispute flag that successfully aborts registration and creates an alert record in the system.
3.  Completing signup logs the user in automatically, hiding the auth entry overlays.

## Done Definition
The helper claims code forms, transparency audits, and auth registration interfaces are fully functional and integrated with backend authentication triggers.
