# Story 15: After-Hours Friction Gating and Ledger

## Objective
Implement off-shift sending confirmation modals (friction walls) and automatic rest-accrual ledgers, ensuring helper off-hours and rest boundaries are respected and documented.

## Context References
*   PRD Spec: [`plan.md`](../plan.md) Section 2.4 & 3
*   Architecture Spec: [`architecture.md`](../architecture.md) Section 6.1, 8 & 10.2

## Dependencies
*   [`Story_14_OfflineFirstSyncQueue.md`](Story_14_OfflineFirstSyncQueue.md)

## Explicit Inputs
*   Component: `<QuickUtosLauncher />`
*   Component: `<DayEditor />` (Schedules layout)

## Step-by-Step Implementation Instructions
1.  **Enforce Gating Modal:** Intercept task assignments or Quick Utos dispatches targeted to helpers whose active schedule registers as "Off" or "Overnight Hard-Off".
2.  **Display Warning Dialogs:** Trigger the confirmation friction modal:
    *   Show a clear description of the boundary breach (e.g. *"Rosa is currently off-shift"* or *"It is currently her Rest Day"*).
    *   Detail the cost in Rest Owed (e.g. *"Proceeding will log 30 minutes of Rest Owed to her ledger"*).
    *   Force the manager to click "Override & Send" to finalize the command.
3.  **Automate Ledger Logs:** Upon task completion, compute the task duration. If the task was executed after-hours, insert an entry into `ledger_entries` using reason `override` or `emergency`, incrementing `duration_minutes` onto the helper's accrued `rest_owed` balance.

## Expected Output
*   Component: `<AfterHoursFrictionModal />` (Responsive warning popup)
*   Automated SQL insertion logic appending after-hours work directly to `ledger_entries`.

## Testable Acceptance Criteria
1.  Attempting to send a Quick Uto after 10 PM triggers the overnight hard-off warning modal.
2.  Clicking "Override & Send" allows the transaction and tags the record in the database as `is_after_hours = true`.
3.  Completing an off-hours task successfully logs the exact minutes to the helper's balance, updating the "Rest Owed" tracker on both dashboards.

## Done Definition
The off-hours confirmation gates prevent accidental pings, emergency overrides are logged, and after-hours work programmatically increments the helper's accrued Rest Owed ledger.
