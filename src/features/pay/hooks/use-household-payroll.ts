import { useEffect, useMemo, useState } from "react";

import { getRestOwedBalanceFn } from "@/features/ledger/rest-off.actions";
import type { Helper, PaydayInterval } from "@/features/people/people.types";
import type { ValeRequest } from "@/features/ledger/ledger.types";

import { netPayForCutoff } from "../net-pay";
import { getHouseholdCutoffFn, type HouseholdCutoff } from "../pay.actions";
import type { Payslip } from "../pay.types";

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
}: {
  token: string | null;
  ready: boolean;
  /** Active helpers only -- an inactive or unclaimed helper cannot be paid. */
  helpers: Helper[];
  vales: ValeRequest[];
  payslips: Payslip[];
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

    Promise.all(
      ids.map((helperId) =>
        getRestOwedBalanceFn({ data: { token, helperId } })
          .then((res) => [helperId, res.minutes] as const)
          .catch((err) => {
            console.error(`[useHouseholdPayroll] Rest-owed balance failed for ${helperId}:`, err);
            // 0 rather than dropping the helper: an unreadable balance must not
            // silently remove someone from a household total.
            return [helperId, 0] as const;
          }),
      ),
    ).then((entries) => {
      if (!cancelled) setRestOwed(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, [ready, token, helperIdKey]);

  return useMemo(() => {
    const rows: HelperPayroll[] = helpers.map((helper) => {
      const cutoff = cutoffs[helper.paydayInterval] ?? null;

      const unsettledVales = vales
        .filter((v) => v.helperId === helper.id && v.status === "approved" && !v.settledInPayslipId)
        .reduce((sum, v) => sum + v.amount, 0);

      // Matched on the helper's OWN cutoff window, so a monthly helper is never
      // compared against a semi-monthly one's dates.
      const payslip = cutoff
        ? (payslips.find(
            (p) =>
              p.helperId === helper.id &&
              p.cutoffStart === cutoff.cutoffStart &&
              p.cutoffEnd === cutoff.cutoffEnd,
          ) ?? null)
        : null;

      const state = stateFor(payslip);

      return {
        helper,
        cutoff,
        netPay:
          state === "due"
            ? netPayForCutoff(helper.monthlyRate, helper.paydayInterval, unsettledVales)
            : (payslip?.netPay ?? 0),
        valeDeductions: state === "due" ? unsettledVales : (payslip?.valeDeductions ?? 0),
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
  }, [helpers, vales, payslips, cutoffs, restOwed]);
}
