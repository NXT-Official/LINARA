# Story 9: Pantry and Palengke Run Shared Context

## Objective
Connect pantry tracking to palengke checklists, implementing automatic suggestions for low-par items and live spend budget math via a shared React `GroceryCtx`.

## Context References
*   PRD Spec: [`plan.md`](../plan.md) Section 2.5 & 5
*   Architecture Spec: [`architecture.md`](../architecture.md) Section 3.2 & 9.2

## Dependencies
*   [`Story_8_DashboardsPassAndStation.md`](Story_8_DashboardsPassAndStation.md)

## Explicit Inputs
*   Component: `<PantrySection />`
*   Context: `GroceryCtx` and `useGrocery()` hooks

## Step-by-Step Implementation Instructions
1.  **Low-Par Suggestions:** Programmatically fetch items in `pantry_items` where current quantity is below or equal to configured par levels (`qty <= par`).
2.  **Inject checklist into task:** Whenever a helper clicks the "Palengke / marketing run" task card on their Station, inject the low-par grocery recommendations dynamically alongside manual grocery items inside the list context.
3.  **Calculate Budgets:** Bind the actual price entry inputs on the helper checklist cards to:
    *   Calculate actual spend in Pesos and update the remaining petty-cash budget live.
    *   Increment corresponding pantry item quantities in the inventory system once checked off.
4.  **Attach Receipts:** Bind receipt upload buttons to trigger local camera modals, simulating S3 picture transfers.

## Expected Output
*   Dynamic "Low Stock" markers in `<PantrySection />`.
*   Interactive grocery checklists attached to Palengke tasks, featuring live budget math (Budget vs. Spent).

## Testable Acceptance Criteria
1.  Reducing a pantry item quantity below its par value automatically populates that item inside the grocery shopping list.
2.  Inputting purchase costs on the helper's checklist subtracts the correct amount from the remaining budget dial displayed on the manager's screen.
3.  Checking an item as "bought" successfully updates and replenishes its corresponding pantry inventory quantity.

## Done Definition
The Pantry auto-suggestions are functional, the Palengke checklists calculate budget spend correctly, and checked items replenish inventory.
