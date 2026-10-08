import { useEffect, useMemo, useState } from "react";

import { getRestOwedBalancesFn } from "@/features/ledger/rest-off.actions";
import type { Helper, PaydayInterval } from "@/features/people/people.types";
import type { ValeRequest } from "@/features/ledger/ledger.types";

import { netPayForCutoff, workedShareOfCutoff } from "../net-pay";
import { periodRate } from "../period-estimate";
import { getHouseholdCutoffFn, type HouseholdCutoff } from "../pay.actions";
import type { PayPeriod, Payslip } from "../pay.types";
import { payslipCovering } from "../payslip-match";
import { useUnpaidLeaveDue } from "./use-unpaid-leave-due";

/**
 * What this cutoff owes, per helper and for the household as a whole.
 *
 * Why this exists: the Pay Dial used to compute one helper's accrued pay from
 * `monthly_rate` alone and never look at `payslips`. Two consequences, both
 * seen for the first time on 2026-08-17 when payouts finally reached
 * `succeeded` (KNOWN_GAPS.md C35/C44):
 *
 *   1. A cutoff that had been PAID still displayed its full accrued amount.
 *      The manager saw "Accrued Net Pay 5,812.50" on money that had already
 *      left the account.
 *   2. On the Pass board the card showed `activeHelpers[0]` -- whoever was
 *      invited most recently -- with nothing saying so. In a two-helper
 *      household that is one arbitrary worker's figure presented as the
 *      household's, on a card whose whole purpose is a glance.
 *
 * So the question this answers is "what does this household still owe for the
 * current cutoff", which is the one a manager actually has, and it degrades
 * correctly to a single helper for the Money tab's per-helper view.
 *
 * PER-HELPER CUTOFFS, NOT ONE HOUSEHOLD CUTOFF. `payday_interval` is a
 * per-helper column, so a household mixing semi-monthly and monthly helpers has
 * two different "current cutoffs" at once. Summing across them is still the
 * right answer to "what is outstanding right now" -- but each helper's amount
 * is computed against THEIR OWN window, never a shared one. That is the
 * MULTI_HELPER_HANDLING.md failure mode, and the reason this hook fetches one
 * cutoff per distinct interval (at most two calls) rather than one for the
 * household.
 *
 * Rest owed comes from `rest_owed_balance_minutes`, the same Postgres function
 * the Money tab's rest-off card and the helper's own app read. The dial used to
 * sum `ledger_entries` locally, which does NOT subtract minutes already
 * redeemed through an approved rest-off request -- so it overstated, and
 * disagreed with the card directly beneath it. Same class of divergence as the
 * one fixed in ../LINARA_MOBILE's `restOwedMinutes` (C42).
 */

/** Where a helper stands for their current cutoff. */
export type PayrollState =
  /** No payslip yet, or the last attempt failed -- this is money still owed. */
  | "due"
  /** Sent to Xendit, not yet terminal. Not due (don't pay again), not settled. */
  | "in_flight"
  /** Ambiguous outcome; a human must reconcile before it can move. */
  | "needs_review"
  /** Paid and confirmed. */
  | "paid";

export interface HelperPayroll {
  helper: Helper;
  /** Null while the cutoff RPC is still resolving -- treat as unknown. */
  cutoff: HouseholdCutoff | null;
  /**
   * For a PAID cutoff this is the payslip's snapshot -- what was actually sent,
   * not what a recomputation says it should have been. Those can differ if the
   * wage changed mid-cutoff, and the record is the honest number (same
   * reasoning as payslips snapshotting base_pay at payout time, C10).
   */
  netPay: number;
  valeDeductions: number;
  /** Unpaid leave this cutoff takes (LEAVE_PLAN.md step 5): what Postgres
   * says the payout will deduct while due, the payslip's snapshot after. */
  unpaidLeaveDays: number;
  unpaidLeaveDeduction: number;
  restOwedMinutes: number;
  state: PayrollState;
  payslip: Payslip | null;
}

export interface HouseholdPayroll {
  rows: HelperPayroll[];
  /** Still to be paid for the current cutoff, summed across active helpers. */
  dueTotal: number;
  inFlightTotal: number;
  paidTotal: number;
  /** Helpers needing manual reconciliation. Surfaced separately: this is the
   *  one state a manager has to act on rather than wait out. */
  needsReviewCount: number;
  restOwedMinutesTotal: number;
  /** True until every helper's cutoff has resolved. Callers must not render a
   *  "due" figure while this is true -- an unknown cutoff rendered as a number
   *  is what Session B removed from this app (C38). */
  loading: boolean;
}

function stateFor(payslip: Payslip | null): PayrollState {
  if (!payslip) return "due";
  switch (payslip.payoutStatus) {
    case "succeeded":
      return "paid";
    case "failed":
      // A failed payout released its vales and left the cutoff retryable, so
      // this really is outstanding money again.
      return "due";
    case "needs_review":
      return "needs_review";
    default:
      return "in_flight";
  }
}

export function useHouseholdPayroll({
  token,
  ready,
  helpers,
  vales,
  payslips,
  payPeriods = {},
  leaveVersion,
}: {
  token: string | null;
  ready: boolean;
  /** Active helpers only -- an inactive or unclaimed helper cannot be paid. */
  helpers: Helper[];
  vales: ValeRequest[];
  payslips: Payslip[];
  /** Each helper's pay periods (usePayPeriods), so a first cutoff she started
   * partway through shows the pro-rated amount the payout will send. */
  payPeriods?: Record<string, PayPeriod[]>;
  /** Changes when leave does (the leave list), so an approval refetches what
   * the cutoff will deduct for it. */
  leaveVersion?: unknown;
}): HouseholdPayroll {
  const [cutoffs, setCutoffs] = useState<Partial<Record<PaydayInterval, HouseholdCutoff>>>({});
  const [restOwed, setRestOwed] = useState<Record<string, number>>({});

  // Distinct intervals, so a household of five semi-monthly helpers costs one
  // call rather than five. Joined into a primitive so the effect below doesn't
  // re-run on every render over a fresh array identity.
  const intervalKey = useMemo(
    () =>
      Array.from(new Set(helpers.map((h) => h.paydayInterval)))
        .sort()
        .join(","),
    [helpers],
  );

  useEffect(() => {
    if (!ready || !token || !intervalKey) {
      setCutoffs({});
      return;
    }

    let cancelled = false;
    const intervals = intervalKey.split(",") as PaydayInterval[];

    Promise.all(
      intervals.map((paydayInterval) =>
        getHouseholdCutoffFn({ data: { token, paydayInterval } })
          .then((res) => [paydayInterval, res] as const)
          .catch((err) => {
            console.error(`[useHouseholdPayroll] Cutoff for ${paydayInterval} failed:`, err);
            return null;
          }),
      ),
    ).then((entries) => {
      if (cancelled) return;
      const next: Partial<Record<PaydayInterval, HouseholdCutoff>> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setCutoffs(next);
    });

    return () => {
      cancelled = true;
    };
  }, [ready, token, intervalKey]);

  const helperIdKey = useMemo(
    () =>
      helpers
        .map((h) => h.id)
        .sort()
        .join(","),
    [helpers],
  );

  useEffect(() => {
    if (!ready || !token || !helperIdKey) {
      setRestOwed({});
      return;
    }

    let cancelled = false;
    const ids = helperIdKey.split(",");

    // One request for everyone (KNOWN_GAPS.md O36). 0 rather than dropping a
    // helper: an unreadable balance must not silently remove someone from a
    // household total.
    getRestOwedBalancesFn({ data: { token, helperIds: ids } })
      .catch((err) => {
        console.error("[useHouseholdPayroll] Rest-owed balances failed:", err);
        return Object.fromEntries(ids.map((id) => [id, 0]));
      })
      .then((balances) => {
        if (!cancelled) setRestOwed(balances);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, token, helperIdKey]);

  // Each helper's current cutoff ends on its own date (a monthly helper's
  // isn't a semi-monthly one's).
  const cutoffEndFor = (helper: Helper) =>
    (payPeriods[helper.id] ?? []).find((p) => p.isCurrent)?.workedEnd ??
    cutoffs[helper.paydayInterval]?.cutoffEnd;
  // One object per change of leave or payslips: what the lookup refetches on.
  const refetchOn = useMemo(() => [leaveVersion, payslips], [leaveVersion, payslips]);
  const unpaidLeave = useUnpaidLeaveDue(
    ready ? token : null,
    helpers.flatMap((h) => {
      const cutoffEnd = cutoffEndFor(h);
      return cutoffEnd ? [{ helperId: h.id, cutoffEnd }] : [];
    }),
    refetchOn,
  );

  return useMemo(() => {
    const rows: HelperPayroll[] = helpers.map((helper) => {
      const cutoff = cutoffs[helper.paydayInterval] ?? null;

      const unsettledVales = vales
        .filter((v) => v.helperId === helper.id && v.status === "approved" && !v.settledInPayslipId)
        .reduce((sum, v) => sum + v.amount, 0);

      // Matched on the helper's OWN cutoff window, so a monthly helper is never
      // compared against a semi-monthly one's dates -- and by overlap, since a
      // first cutoff is stored with the days she worked (add-pay-periods.sql).
      const payslip = cutoff
        ? (payslipCovering(payslips, helper.id, cutoff.cutoffStart, cutoff.cutoffEnd) ?? null)
        : null;
      const period = (payPeriods[helper.id] ?? []).find((p) => p.isCurrent);
      const workedShare = period
        ? workedShareOfCutoff(
            period.workedStart,
            period.workedEnd,
            period.fullStart,
            period.fullEnd,
          )
        : 1;

      const state = stateFor(payslip);
      const leave = unpaidLeave(helper.id, period?.workedEnd ?? cutoff?.cutoffEnd);

      return {
        helper,
        cutoff,
        netPay:
          state === "due"
            ? netPayForCutoff(
                periodRate(helper, period),
                helper.paydayInterval,
                unsettledVales,
                workedShare,
                leave.deduction,
              )
            : (payslip?.netPay ?? 0),
        valeDeductions: state === "due" ? unsettledVales : (payslip?.valeDeductions ?? 0),
        unpaidLeaveDays: state === "due" ? leave.days : (payslip?.unpaidLeaveDays ?? 0),
        unpaidLeaveDeduction:
          state === "due" ? leave.deduction : (payslip?.unpaidLeaveDeduction ?? 0),
        restOwedMinutes: restOwed[helper.id] ?? 0,
        state,
        payslip,
      };
    });

    const sumWhere = (state: PayrollState) =>
      rows.filter((r) => r.state === state).reduce((sum, r) => sum + r.netPay, 0);

    return {
      rows,
      dueTotal: sumWhere("due"),
      inFlightTotal: sumWhere("in_flight"),
      paidTotal: sumWhere("paid"),
      needsReviewCount: rows.filter((r) => r.state === "needs_review").length,
      restOwedMinutesTotal: rows.reduce((sum, r) => sum + r.restOwedMinutes, 0),
      loading: rows.some((r) => r.cutoff === null),
    };
  }, [helpers, vales, payslips, cutoffs, restOwed, payPeriods, unpaidLeave]);
}
