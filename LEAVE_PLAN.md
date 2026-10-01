# Leave and days off: plan and scope

Status: **plan, not built.** Closes KNOWN_GAPS O21 when done; builds on O19 (time off on the calendars). Spans both repos: `LINARA` owns the schema, and both apps get UI.

Decisions still open are marked **Decide**. Collected at the bottom.

## What exists today

| What | Where | What it covers |
| --- | --- | --- |
| Weekly rest day | `helper_profiles.weekly_rest_day` | One fixed day a week. Shown on both calendars. |
| Rest off (time off in lieu) | `rest_off_requests` (`add-rest-off-requests.sql`, `add-rest-off-validation.sql`) | One date plus a time window, paid for out of the rest she earned working after hours (`rest_owed_balance_minutes`). She asks on My Pay; a manager decides on Money. Shown on neither calendar (O19). |
| Start date | `helper_profiles.started_on` | Her first working day. Enough to work out leave eligibility. |
| Pay | `initiate_payslip`, `net-pay.ts` in both repos | `net = base - statutory share - unsettled vales`. No term for leave. |

Nothing covers multi-day leave, sick days, or unpaid days.

## The four kinds of time off

As agreed on 2026-10-01: helpers track their legally required leave in Linara, and households also give days off "in kind" and unpaid days.

| Kind | Paid? | Comes out of | Notes |
| --- | --- | --- | --- |
| **Service incentive leave (SIL)** | Yes | 5 days per service year | RA 10361 §29: after one year of service, 5 days of leave with pay a year. Unused days don't carry over and can't be converted to cash. She chooses what it's for (vacation, sick, family, other); the law doesn't split sick leave out for kasambahay. |
| **Day off in kind** | Yes, in time | Her rest-owed balance | The whole-day version of today's rest off. A full day debits one shift's minutes (shift length minus break) from the same balance, so after-hours work stays time, not money (C39). |
| **Unpaid leave** | No | Nothing | Deducted from the cutoff it falls in, at a daily rate (**Decide** the divisor). |
| **Extra paid day** | Yes | Nothing (household's choice) | A household perk beyond the law: paid leave before her first year, an extra sick day, a fiesta. No balance; the household simply grants it. |

**Decide:** "days off in kind" is read here as time off in lieu (paid in rest, not cash), matching the 2026-08-16 decision in `add-rest-off-requests.sql`. If you meant days the household gives as a perk, that's the fourth row, and both can stay.

**Other legal leave (Decide which go in v1, after checking).** Maternity (RA 11210), paternity (RA 8187), solo parent (RA 11861), VAWC (RA 9262) and the Magna Carta of Women's special leave (RA 9710) may also apply to kasambahay, but coverage, who pays (SSS or the household) and service minimums vary. Confirm each with DOLE or a labor lawyer before encoding. The design keeps leave types as data, so adding one later is a row, not a migration.

## Rules

- **Whole days only in v1.** Hour windows stay on rest off, which already works. Half days can follow.
- **A leave day is a working day.** Her weekly rest day inside a leave range costs nothing and isn't counted.
- **No overlaps.** Two approved leaves for the same helper can't cover the same day, and leave can't overlap an approved rest-off window.
- **Balances are checked under a lock when approving**, the same way `decide_rest_off_request` locks `helper_profiles` (C36 / the concurrent-approval note in that migration).
- **SIL service year** runs from her `started_on` anniversary. Before the first anniversary her SIL balance is 0; a household that gives leave earlier uses an extra paid day.
- **A manager can record leave for her** (she called in sick). It's approved when recorded, and her app asks her to confirm or dispute it, the same pattern as a manual payment's `helper_ack`. That keeps her record hers.
- **She can cancel** a pending request, or an approved one that hasn't started.
- **Dates are household dates** (C38, `household_today()`), never a device's.

## What changes where

### Schema (`LINARA/supabase/add-leave.sql`, applied by hand)

- `leave_requests`: `helper_id`, `kind` (`sil` | `in_kind` | `unpaid` | `extra_paid`), `reason` (`vacation` | `sick` | `family` | `other`), `start_date`, `end_date` (inclusive), `days` (working days, snapshotted at decision time like `rest_off_requests.minutes`), `minutes` (in-kind debit, snapshotted), `note`, `status` (`pending` | `approved` | `declined` | `cancelled`), `requested_by`, `decided_by`, `decided_at`, `decline_reason`, `helper_ack` (`pending` | `confirmed` | `disputed`, for manager-recorded leave), `settled_in_payslip_id` (unpaid only, like `vales`).
- RLS: the household-isolation pattern `rest_off_requests_isolation` uses. Not private; it's addressed to the manager.
- `sil_balance_days(helper)` and an updated `rest_owed_balance_minutes(helper)` that also subtracts approved in-kind leave, so there's still exactly one rest-owed number.
- RPCs: `request_leave`, `record_leave` (manager, auto-approved), `decide_leave_request`, `cancel_leave_request`, `ack_leave`. Same validation style as `request_rest_off`: plain-language refusals she can read on her phone.
- `payslips.unpaid_leave_deduction` and `unpaid_leave_days`; `initiate_payslip` (and the final-pay path in `add-employment-end.sql`) deduct unsettled approved unpaid leave and mark it settled.

### Web dashboard (`LINARA`)

- **Pass, Needs you:** pending leave requests, with approve and decline. Approving shows how many of her tasks fall on those days and offers to move them to Unassigned.
- **Schedule:** leave on the planner (Week, By person, Month) and on the shared time-off layer O19 adds. Routines don't spawn for her on leave days.
- **People / helper:** balances (SIL left this service year, rest owed), history, and "Record leave".
- **Availability:** "On leave" counts as off for the send gate and the off-shift checks.
- **Money:** unpaid leave days and their deduction on the period estimate and the payslip.

### Helper app (`LINARA_MOBILE`)

- **Request leave:** kind, dates, reason, note. Shows her balances and what the request would leave.
- **My Week:** leave and approved rest off on their days (O19), plus next/previous week and a month view.
- **Confirm or dispute** leave a manager recorded for her.
- **Payslip:** the unpaid-leave line, from the stored payslip, not recomputed.
- **My Record and its PDF:** leave taken by kind and year. Part of the RA 10361 record she keeps.

## Order of work

Each step ships on its own.

1. **Time off on the calendars (O19).** No schema change. Approved and pending rest off on the web planner and My Week, and in the off-shift and availability checks. Built as a general "time off" layer that leave plugs into.
2. **Schema.** `add-leave.sql`: table, RLS, balances, RPCs. Applied by hand to the sandbox project.
3. **Request and decide.** Helper app request form and balances; web Needs you, People, and Record leave. Leave appears through the step-1 layer.
4. **Tasks and routines on leave days.** The move-to-Unassigned prompt; routines skip her.
5. **Pay.** The unpaid deduction in `initiate_payslip`, both `net-pay.ts` files, the Pay Dial and both payslip views. The riskiest step: three surfaces have to agree on net pay (see `net-pay.ts`'s header).
6. **Record.** Leave on My Record and in its PDF.

Moves stay visible to her throughout (O20), so a task moved off a leave day tells her.

## Decide

1. **Daily rate for unpaid leave.** `monthly_rate × 12 ÷ 313` (six-day week), `÷ 261` (five-day), `÷ 365`, or a household setting? Confirm with whoever does payroll.
2. **"Days off in kind":** time off in lieu (assumed above), or household perk days, or both?
3. **Other legal leave in v1:** SIL only, or also some of maternity, paternity, solo parent, VAWC and special leave for women, once checked?
4. **Half days:** wait for v2 (assumed), or needed now?
5. **Manager-recorded leave:** auto-approved with her confirmation afterwards (assumed), or does she approve first?

Not in scope: public holidays and holiday pay, leave conversion to cash (RA 10361 rules it out for SIL), and accrual for part-time or live-out arrangements beyond what `started_on` already gives.
