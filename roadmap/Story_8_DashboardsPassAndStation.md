# Story 8: Dashboards: The Pass and The Station

## Objective

Refactor the core workspace dashboards—implementing vertical lane and classic board toggling on "The Manager's Pass" and a clean single-task card focus layout on "The Worker's Station."

## Context References

- PRD Spec: [`plan.md`](../plan.md) Section 1.2, 5 & 6
- Architecture Spec: [`architecture.md`](../architecture.md) Section 3.1 & 4.1

## Dependencies

- [`Story_7_AuthAndClaimOnboardingScreens.md`](Story_7_AuthAndClaimOnboardingScreens.md)

## Explicit Inputs

- Component: `<ManagerView />` and `<HelperView />` in code

## Step-by-Step Implementation Instructions

1.  **Toggles on the Pass:** Configure the header on `<ManagerView />` with a persistent view toggle:
    - **The Line:** Renders tasks vertically, grouped into rows or columns by helper/station (`Yaya`, `Cook`, `Driver`, `Laundry`, `House`).
    - **The Board:** Renders tasks in a horizontal Kanban layout (`Todo`, `In Progress`, `Done`).
2.  **Focused Helper Focus Layout:** Refactor `<HelperView />` to display exactly ONE active ticket on screen at any time (the current high-priority task), showing the attached SOP slide instructions.
3.  **Integrate Status Updates:** Bind the task trigger buttons (`Start Work`, `Complete Task` with camera evidence popup) to call `/api/tickets/:id/status` and `/api/tickets/:id/complete` endpoint mutations.

## Expected Output

- Refactored Pass component supporting responsive Line/Board view shifting.
- Refactored Worker Station focuses, rendering the single active ticket with interactive SOP step-slides.

## Testable Acceptance Criteria

1.  On the Manager Pass, toggling "The Board" displays tasks grouped strictly under Kanban columns.
2.  The Worker Station displays only the first unfinished task. Complete cards are replaced by the next task on shift.
3.  Tapping "Start Work" changes the task state to `in_progress` locally and updates UI button actions.

## Done Definition

The Manager Pass toggles are responsive and persistent, the focused Worker Station focus-card behaves correctly, and status mutations are fully linked.
