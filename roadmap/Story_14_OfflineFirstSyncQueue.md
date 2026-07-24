# Story 14: Offline-First Sync Queue

## Objective
Construct client-side offline-first caching queues utilizing IndexedDB / LocalStorage, enabling helpers to execute checklists and capture receipt photos during network disruptions.

## Context References
*   PRD Spec: [`plan.md`](../plan.md) Section 2.5 & 3
*   Architecture Spec: [`architecture.md`](../architecture.md) Section 3.2 & 5.4

## Dependencies
*   [`Story_13_RealtimeSynchronizationChannels.md`](Story_13_RealtimeSynchronizationChannels.md)

## Explicit Inputs
*   Service: `navigator.onLine` checks
*   Storage: IndexedDB schema definition

## Step-by-Step Implementation Instructions
1.  **Build Offline Queue Store:** Implement an IndexedDB offline queue store `src/lib/offline-queue.ts` containing properties: `id`, `action` (e.g. `complete_ticket`, `buy_grocery`), `payload` (JSON form details), and `binaryPhoto` (captured receipt or evidence image blob).
2.  **Intercept Network Calls:** Refactor the API mutation triggers in `<HelperView />`. If `navigator.onLine === false`, divert the payload to the local offline queue and display a comforting, warm Taglish toast: *"Naka-save offline! Aayusin natin pag may internet na ulit."*
3.  **Construct Sync Daemon:** Program an event listener checking `window.addEventListener('online', ...)` to loop through the offline queue, upload the cached binaries, execute the API endpoints, and flush the queue upon recovery.

## Expected Output
*   File: `src/lib/offline-queue.ts` (Sync queue operations)
*   Toast notifications signaling offline state saves.

## Testable Acceptance Criteria
1.  Disconnecting local internet allows the helper to click "Complete Task", take a photo, and save progress without throwing client errors.
2.  The task status displays an "Offline Pending Sync" badge in the UI while offline.
3.  Reconnecting internet automatically initiates background sync uploads, updates the central database tables, and removes the pending badges.

## Done Definition
The IndexedDB local queue store is active, offline-to-online triggers sync cached tasks and picture binaries automatically, and user-facing state indicators render correctly.
