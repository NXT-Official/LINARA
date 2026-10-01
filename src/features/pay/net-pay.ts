import { computeStatutorySplit, cutoffsPerMonth } from "@/features/people/people.utils";
import type { PaydayInterval } from "@/features/people/people.types";

/**
 * The ONE definition of what a kasambahay takes home for a cutoff.
 *
 * Session E / E4 (PAYMENTS_REMEDIATION.md). Session C's stated acceptance
 * criterion was that three surfaces agree for the same helper and cutoff:
 *
 *   1. the manager's Pay Dial          -- SpendAndPayday (this repo)
 *   2. the helper's DigitalPayslip     -- ../LINARA_MOBILE
 *   3. the net_pay actually written    -- initiate_payslip, in Postgres
 *
 * They did agree, but only *by construction* -- three hand-written copies of
 * the same expression that happened to match after the peso line came out of
 * the Pay Dial (KNOWN_GAPS.md C39). Nothing stopped the next person adding a
 * term to one of them. This module collapses the two in-repo copies into one
 * and `net-pay.test.ts` pins the other two.
 *
 * THE INVARIANT, stated once:
 *
 *     net = max(0, base - statutory employee share - unsettled approved vales
 *                  - unpaid leave)
 *
 * and nothing else. Unpaid leave (LEAVE_PLAN.md step 5,
 * supabase/add-unpaid-leave-pay.sql) is days x monthly rate x 12 /
 * pay_days_per_year; which leave a cutoff takes is Postgres's to say
 * (`unpaid_leave_due`), so callers pass the peso figure it returns rather than
 * working out the days themselves. In particular **no term from `ledger_entries`**. After-hours
 * work is TIME, not money (user decision 2026-08-16, C39): rest owed accrues in
 * minutes and is redeemed through `rest_off_requests`, and rest-day premium is
 * explicitly not paid in cash either. There is no peso path out of the ledger
 * anywhere in the payout code and one must not be added here. If a cash policy
 * ever lands, it goes through `initiate_payslip` and a new snapshot column
 * FIRST -- the Pay Dial is a mirror of what the payout writes, never a promise
 * the payout does not keep. That inversion is exactly what C39 was.
 *
 * The Postgres side deliberately re-derives `net_pay` itself from the base and
 * statutory figures it is handed, rather than trusting a caller-supplied total
 * (same reasoning as C38 moving cutoff derivation inside the function). So this
 * module and `initiate_payslip` are two implementations of one rule, and the
 * test asserts they still say the same thing.
 */

export interface PayComponents {
  /** Monthly rate divided across the cutoffs in a month. */
  basePay: number;
  /** The employee's share of SSS/PhilHealth/Pag-IBIG, for this cutoff. */
  statutoryEmployeeShare: number;
}

/**
 * The two figures `initiate_payslip` is called with. Kept separate from
 * `netPayForCutoff` because Postgres receives these and computes the net
 * itself -- the RPC is the authority on the vale total, which it reads under
 * a row lock rather than taking from the client.
 */
export function payComponentsForCutoff(
  monthlyRate: number,
  paydayInterval: PaydayInterval,
  workedShare = 1,
): PayComponents {
  const cutoffs = cutoffsPerMonth(paydayInterval);
  const basePay = monthlyRate / cutoffs;
  const statutoryEmployeeShare = computeStatutorySplit(monthlyRate).totalEmployee / cutoffs;
  if (workedShare >= 1) return { basePay, statutoryEmployeeShare };
  // A final, shortened cutoff (she left mid-period): both figures scale with
  // the days worked, rounded to centavos because they are snapshotted as-is.
  const share = Math.max(0, workedShare);
  return {
    basePay: Math.round(basePay * share * 100) / 100,
    statutoryEmployeeShare: Math.round(statutoryEmployeeShare * share * 100) / 100,
  };
}

/** Whole calendar days in [start, end], from "YYYY-MM-DD" strings. */
function daysInclusive(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

/**
 * How much of a cutoff was worked: 1 for an ordinary cutoff, less for the
 * first one (she started mid-period) or the final one (she left mid-period).
 * helper_pay_periods / helper_pay_cutoff give both the days she worked and
 * the cutoff's normal bounds. Pro-rated by calendar days, the same way the
 * monthly rate is spread over a cutoff in the first place.
 */
export function workedShareOfCutoff(
  workedStart: string,
  workedEnd: string,
  fullStart: string,
  fullEnd: string,
): number {
  const full = daysInclusive(fullStart, fullEnd);
  if (full <= 0) return 1;
  return Math.min(1, Math.max(0, daysInclusive(workedStart, workedEnd) / full));
}

/** Days worked in a period, for display ("3 days worked"). */
export function daysWorked(workedStart: string, workedEnd: string): number {
  return Math.max(0, daysInclusive(workedStart, workedEnd));
}

/**
 * RA 10361 Sec. 25: 13th-month pay is at least 1/12 of the basic salary
 * earned in the calendar year, pro-rated on separation. Linara neither
 * computes nor pays it yet (KNOWN_GAPS.md O15); this is the estimate shown
 * when an employment ends, from the basic pay Linara has on record.
 */
export function thirteenthMonthEstimate(basicPayEarnedThisYear: number): number {
  return Math.round((Math.max(0, basicPayEarnedThisYear) / 12) * 100) / 100;
}

/**
 * Net take-home for one cutoff. Mirrors `initiate_payslip`'s
 * `GREATEST(0, p_base_pay - p_statutory_employee_share - v_vale_total - v_leave_total)`.
 *
 * `unsettledValeTotal` must be approved vales with `settled_in_payslip_id IS
 * NULL` only -- a vale already deducted from a previous cutoff's payout would
 * otherwise keep shrinking this estimate forever.
 *
 * Note there is no parameter for ledger minutes, and that is the point: the
 * invariant is enforced by the signature, not by a comment.
 */
export function netPayForCutoff(
  monthlyRate: number,
  paydayInterval: PaydayInterval,
  unsettledValeTotal: number,
  /** Share of the cutoff worked, for a first or final one (workedShareOfCutoff). */
  workedShare = 1,
  /** What `unpaid_leave_due` says this cutoff takes for unpaid leave, in pesos. */
  unpaidLeaveDeduction = 0,
): number {
  const { basePay, statutoryEmployeeShare } = payComponentsForCutoff(
    monthlyRate,
    paydayInterval,
    workedShare,
  );
  return Math.max(0, basePay - statutoryEmployeeShare - unsettledValeTotal - unpaidLeaveDeduction);
}
