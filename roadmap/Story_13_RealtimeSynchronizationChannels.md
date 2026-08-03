# Story 13: Real-time Synchronization Channels

## Objective

Integrate Supabase Realtime Channel subscriptions inside frontend feature components, broadcasting ticket status changes, Quick Utos alerts, and ledger adjustments across concurrent sessions.

## Context References

- PRD Spec: [`plan.md`](../plan.md) Section 2.1, 2.3 & 3
- Architecture Spec: [`architecture.md`](../architecture.md) Section 4.1, 5.1 & 6.3
- Legacy Spec: [`original-ARCHITECTURE.md`](../original-ARCHITECTURE.md) Section 6 & 7

## Dependencies

- [`Story_12_AIUtosRoutingEdgeFunction.md`](Story_12_AIUtosRoutingEdgeFunction.md)

## Explicit Inputs

- File: `src/features/board/` (Active board listeners)
- File: `src/features/utos/` (Quick utos listeners)

## Step-by-Step Implementation Instructions

1.  **Configure Channel Channels:** Initialize custom Realtime Channels inside the root state container ([`src/routes/index.tsx:LinaraApp`](../src/routes/index.tsx:6)):
    - `household-board-channel`: Listens to modifications on the `tickets` table filtered by `household_id`.
    - `quick-utos-channel`: Listens to INSERT events on the `quick_utos` table targeted to the current active helper session.
2.  **Integrate Client Listeners:** Bind the client components to refresh TanStack query caches or mutate local array states instantaneously when broadcast payloads arrive.
3.  **Ensure Smooth Fallbacks:** Program graceful polling checks if Websocket channels drop, verifying the board remains stable.

## Expected Output

- Websocket connection routines in client dashboard templates.
- Real-time multi-terminal synchronizations of task board transitions.

## Testable Acceptance Criteria

1.  Dragging a card to "Done" on the Helper's device flips that card to "Done" on the Manager's Pass within 500ms without manual refreshing.
2.  A manager sending a Quick Uto triggers a floating colored chip at the bottom of the helper's station instantaneously.
3.  Tapping "Got it" on the helper's station updates and removes the card status live on the manager's view.

## Done Definition

Supabase Realtime subscriptions are active across dashboards, broadcasts synchronize task transitions and Quick Utos instantaneously, and connection handlers are robust.
