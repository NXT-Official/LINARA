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
 *     net = max(0, base - statutory employee share - unsettled approved vales)
 *
 * and nothing else. In particular **no term from `ledger_entries`**. After-hours
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
): PayComponents {
  const cutoffs = cutoffsPerMonth(paydayInterval);
  return {
    basePay: monthlyRate / cutoffs,
    statutoryEmployeeShare: computeStatutorySplit(monthlyRate).totalEmployee / cutoffs,
  };
}

/**
 * Net take-home for one cutoff. Mirrors `initiate_payslip`'s
 * `GREATEST(0, p_base_pay - p_statutory_employee_share - v_vale_total)`.
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
): number {
  const { basePay, statutoryEmployeeShare } = payComponentsForCutoff(monthlyRate, paydayInterval);
  return Math.max(0, basePay - statutoryEmployeeShare - unsettledValeTotal);
}
