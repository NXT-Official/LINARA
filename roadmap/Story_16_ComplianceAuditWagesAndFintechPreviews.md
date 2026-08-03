# Story 16: Compliance Audit, Wages, and Fintech Previews

## Objective

Implement regional Batas Kasambahay contribution calculators, visual progress dials for budgets/paydays, and webhook payload previews for future GCash / Maya e-wallet disbursements.

## Context References

- PRD Spec: [`plan.md`](../plan.md) Section 3.1 & 14
- Architecture Spec: [`architecture.md`](../architecture.md) Section 4.1 (Spend/Pay Dials) & 5.3

## Dependencies

- [`Story_15_AfterHoursFrictionGatingAndLedger.md`](Story_15_AfterHoursFrictionGatingAndLedger.md)

## Explicit Inputs

- Component: `<MoneySection />`
- Config Var: `REGIONAL_MINIMUM_WAGE`

## Step-by-Step Implementation Instructions

1.  **Compliance Warning:** Build a Batas Kasambahay compliance validator inside `<PeopleList />` or `<HelperProfile />`:
    - Compares the helper's wage detail rate to `REGIONAL_MINIMUM_WAGE`.
    - Flashes a friendly, supportive compliance flag if wages fall below regional mandates.
2.  **Integrate Contribution Cards:** Build a visual details card showing legal contribution allocations (SSS, PhilHealth, Pag-IBIG) split proportionally based on Batas Kasambahay parameters (100% employer-funded if wage < ₱5,000).
3.  **Refine Dashboard Dials:** Build clean, responsive visual dials (SVG progress circles or Tailwind bar meters) inside the Pass:
    - **Spend Dial:** Petty-cash spent in Pesos against weekly palengke targets.
    - **Pay Dial:** Upcoming payday base wages, pending approved vale deductions, and accrued rest-owed hours.
4.  **Fintech Preview Webhook:** Implement a "Transfer via GCash / Maya" button on `<PayRecordView />`. Tapping it displays a mockup webhook payload schema containing the exact target mobile wallet coordinates and final calculated net payroll amount.

## Expected Output

- Batas Kasambahay Regional Compliance Checker.
- Visual dashboard progress dials (Spend and Pay).
- GCash/Maya e-wallet disbursement schema previews.

## Testable Acceptance Criteria

1.  Setting a helper's wage details below the regional minimum triggers an inline warning card citing Batas Kasambahay parameters.
2.  Wage rates under ₱5,000 auto-apportion SSS contribution calculators entirely to the employer column.
3.  Tapping "GCash Transfer" renders a clean JSON payload showing the correct payee number and total wage deduction details.

## Done Definition

The regional compliance checker is active, the visual dials render correctly, and the fintech integration webhook schemas preview successfully.
