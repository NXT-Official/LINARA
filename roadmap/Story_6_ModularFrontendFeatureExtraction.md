# Story 6: Modular Frontend Feature Extraction

## Objective

Deconstruct the massive single-file index.tsx (~5700 lines) into modular, independent feature directories under `src/features/`, extracting components and local custom hooks while maintaining fully unified state structures.

## Context References

- PRD Spec: [`plan.md`](../plan.md) Section 1.2, 5 & 11
- Architecture Spec: [`architecture.md`](../architecture.md) Section 1.2, 3.1 & 3.2
- Legacy Spec: [`original-ARCHITECTURE.md`](../original-ARCHITECTURE.md) Section 2 & 5

## Dependencies

- [`Story_5_InvitationAndClaimHandshakeAPIs.md`](Story_5_InvitationAndClaimHandshakeAPIs.md)

## Explicit Inputs

- File: [`src/routes/index.tsx`](../src/routes/index.tsx)
- Directories: `src/features/*`

## Step-by-Step Implementation Instructions

1.  **Extract UI Subcomponents:** Extract the prototype UI segments from [`src/routes/index.tsx`](../src/routes/index.tsx) into dedicated components in their corresponding `src/features/` folders:
    - `src/features/board/` -> `<TheBoardStatusLists />`, `<BoardTaskCard />`, `<HelperLane />`
    - `src/features/people/` -> `<InviteHelperModal />`, `<PeopleList />`
    - `src/features/shifts/` -> `<ShiftsSection />`, `<DayEditor />`
    - `src/features/ledger/` -> `<LedgerSection />`, `<ValeRequestModal />`
    - `src/features/pantry/` -> `<PantryList />`, `<PantryHeader />`
    - `src/features/utos/` -> `<QuickUtosLauncher />`, `<QuickUtosFeed />`
    - `src/features/notes/` -> `<PrivateNotesScratchpad />`
2.  **Maintain Callback Contracts:** Keep `src/routes/index.tsx` as the master orchestrator, passing unified state hooks and database callbacks down to the newly modularized child features.
3.  **Clean Up Imports:** Add relative import paths and alias links (`@/features/...`) to ensure compilation is fully functional.

## Expected Output

- Modular files generated under `src/features/{board,people,shifts,ledger,pantry,utos,notes}/`
- Refactored [`src/routes/index.tsx`](../src/routes/index.tsx) (reduced footprint, importing from modular folders)

## Testable Acceptance Criteria

1.  The workspace builds successfully using `bun run build`.
2.  Interacting with features (such as checking a task or submitting notes) behaves exactly like the pre-existing single-file prototype.
3.  No imports cause runtime reference errors on the browser client.

## Done Definition

The frontend components are cleanly extracted and modularized, business operations are partitioned into standalone modules, and the interface remains fully operational and bug-free.
