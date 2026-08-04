# Story 16: Compliance Audit, Wages, and Fintech Previews

## 📌 Metadata
* **Objective:** Implement regional Batas Kasambahay wage compliance checks, visual budget/payday progress dials, and GCash/Maya webhook payload previews.
* **PRD Reference:** [`plan.md`](../plan.md) (Sections 3.1 & 14)
* **Architecture Reference:** [`architecture.md`](../architecture.md) (Sections 4.1 & 5.3)
* **Dependencies:** [`Story_15_AfterHoursFrictionGatingAndLedger.md`](Story_15_AfterHoursFrictionGatingAndLedger.md)

---

## 📥 Inputs & Configuration
* **Target Components:** `<MoneySection />`, `<PeopleList />`, `<HelperProfile />`, `<PayRecordView />`
* **Configuration Variables:** `REGIONAL_MINIMUM_WAGE` (numeric threshold value)

---

## 🛠️ Step-by-Step Implementation Plan

### 1. Batas Kasambahay Compliance Validator
Add a real-time compliance validation layer inside `<PeopleList />` or `<HelperProfile />`.

```
[Helper Wage Rate] ──( Compare )──> [REGIONAL_MINIMUM_WAGE]
                             │
                             ├─ Below Min ──> Trigger Compliance Warning Card
                             └─ OK ─────────> Show normal status
```

* **Validation Logic:** Compare the helper's set wage against the `REGIONAL_MINIMUM_WAGE` configuration.
* **UI/UX:** If the wage is below the mandate, display a supportive, highly visible compliance warning card (e.g., using a warm yellow/amber Tailwind banner).

---

### 2. Legal Contribution Split Cards
Create a visual breakdown card calculating and displaying legal contributions (SSS, PhilHealth, Pag-IBIG) based on Batas Kasambahay parameters:

| Helper Monthly Wage | Employer Share | Employee Share |
| :--- | :--- | :--- |
| **Under ₱5,000** | **100%** | **0%** (Fully funded by Employer) |
| **₱5,000 and Above** | Proportional split | Proportional split |

---

### 3. Interactive Dashboard Dials
Build clean, responsive progress indicators (using custom SVG progress circles or styled Tailwind bar meters) inside the primary view:

* **📈 Spend Dial (Target vs. Actual):**
  * Tracks petty-cash spent in Pesos against the set weekly target (e.g., *Palengke* budget).
* **📉 Pay Dial (Accrued vs. Deducted):**
  * Displays upcoming payday base wages.
  * Subtracts pending approved cash advances (*vale* deductions).
  * Adds accrued rest-owed hours.

---

### 4. Fintech Webhook Preview
Add a **"Transfer via GCash / Maya"** button to `<PayRecordView />`. When tapped, render a clean, code-highlighted modal displaying the exact JSON payload that would be sent to the disbursement partner.

```json
{
  "event": "disbursement.requested",
  "provider": "gcash",
  "timestamp": "2026-08-04T10:06:00Z",
  "data": {
    "recipient_mobile": "+63917XXXXXXX",
    "gross_pay_amount": 5000.00,
    "vale_deductions": 500.00,
    "net_disbursement": 4500.00,
    "currency": "PHP"
  }
}
```

---

## ✅ Testable Acceptance Criteria

* [x] **Wage Verification:** Setting a helper's wage details below `REGIONAL_MINIMUM_WAGE` immediately triggers an inline warning card citing Batas Kasambahay.
* [x] **Contribution Rule:** If the monthly wage is set below ₱5,000, SSS/PhilHealth/Pag-IBIG allocation displays 100% in the Employer column and 0% in the Employee column.
* [x] **Visual Metrics:** Spend and Pay progress dials scale correctly and update on change of transaction ledgers.
* [x] **Webhook Preview:** Clicking "GCash Transfer" opens a preview modal with a valid JSON payload showing correct target mobile numbers and final net payouts.

---

## 🏁 Definition of Done
* [x] **Batas Kasambahay Compliance:** Wage validator operates reactively on wage changes.
* [x] **Visual Polish:** Dashboard dials render cleanly across both desktop and mobile layouts.
* [x] **Fintech Mocking:** Webhook schema preview correctly handles dynamic calculations for net payroll.