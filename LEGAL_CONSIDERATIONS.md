# Legal considerations

**Not legal advice.** This is the list of legal questions Linara's design depends on: what we assume today, what is deferred, and what to confirm with DOLE or a labor lawyer before encoding it. Nothing here is settled law until someone qualified has checked it against current rules.

Started 2026-10-02 while scoping leave (`LEAVE_PLAN.md`, KNOWN_GAPS O21). Add to it whenever a feature rests on a reading of the law.

## Built on, or about to be

| Topic | What Linara does | Source we're relying on | To confirm |
| --- | --- | --- | --- |
| **Service incentive leave (SIL)** | 5 paid days per service year once she has a year of service, counted from `helper_profiles.started_on`. Unused days don't carry over and aren't paid out. Usable for any reason (vacation, sick, family). | RA 10361 (Batas Kasambahay) §29 | The service-year boundary (anniversary of `started_on`), and whether a household may let unused days carry over by choice (we'd model that as an extra paid day). |
| **Daily rate for unpaid leave** | `monthly_rate × 12 ÷ 365` by default, so every calendar day counts, as for a live-in. A per-helper setting allows 313 (six-day week) or 261 (five-day week) for staff who aren't there every day. Decided 2026-10-02. | Common payroll factors for monthly-paid workers | Which factor is right per arrangement, and whether a household may pick freely. 365 gives the smallest deduction, so it is the cautious default. |
| **Days off in kind** | After-hours work is repaid as time off (rest owed), not cash. Whole days come out of the same balance. | Product decision 2026-08-16 (`supabase/add-rest-off-requests.sql`) | Whether rest-day work owes a cash premium under RA 10361 as it would under the Labor Code. Open questions written up in `home-management-concept.md` (the rest-day premium note under §13). |
| **Weekly rest** | One fixed rest day a week, protected by the availability gate. | RA 10361 (24 consecutive hours of rest a week) | Whether the household and helper may agree on a different day week to week. |
| **Minimum wage and contributions** | Regional minimum check; SSS, PhilHealth and Pag-IBIG split, with the employer covering everything below ₱5,000. | `plan.md` §5.3, `README.md` §7 | Current regional minimums and contribution tables; these change. |
| **Records** | Payslips, vales, hours, leave and tasks stay with the helper after she leaves (her portable record). | RA 10361 record-keeping; `AGENTS.md` | How long a household must keep payslips and leave records. Applies once a real household signs up (see the environment note in `KNOWN_GAPS.md`). |

## Deferred: other leave the law may give her

Deferred on 2026-10-02: not in leave v1. Leave types are data in the planned schema, so adding one later is a row and some copy, not a migration. Before any goes in, confirm for each: **does it cover kasambahay**, **who pays** (SSS, the household, or both), **what service minimum applies**, and **what proof is needed**.

| Leave | Law | What it generally provides (to verify) | Open questions for kasambahay |
| --- | --- | --- | --- |
| Maternity | RA 11210 (Expanded Maternity Leave) | 105 days with pay, more for solo mothers; less for miscarriage. Benefit paid through SSS. | SSS covers kasambahay, but does a household owe the salary differential, or is it exempt? How do we record days paid by SSS rather than the household? |
| Paternity | RA 8187, and transfer of maternity days under RA 11210 | 7 days with pay for a married father, for the first four deliveries. | Coverage of kasambahay; how a transfer from the mother's leave is recorded. |
| Solo parent | RA 11861 (Expanded Solo Parents Welfare Act) | Paid parental leave each year for a solo parent with enough service. | Service minimum and days as amended; what ID or certification the household may ask for. |
| Violence against women and children | RA 9262 | Up to 10 days paid leave for a woman who is a victim, extendable. | Coverage of kasambahay; keeping the reason private (likely her side only, like `helper_notes`). |
| Special leave for women | RA 9710 (Magna Carta of Women) | Up to two months with full pay after gynecological surgery, with a service minimum. | Coverage of kasambahay; proof required. |

## Out of scope for now

- **Public holidays and holiday pay.** Whether and how they apply to kasambahay, and on which days.
- **Converting leave to cash.** RA 10361 rules it out for SIL; nothing else converts either.
- **Part-time and multi-household work.** Out of scope (user, 2026-10-01).
