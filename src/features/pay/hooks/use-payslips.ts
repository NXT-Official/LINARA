import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { initiatePayoutFn, listPayslipsFn, type PayslipRow } from "../pay.actions";
import type { Payslip, PayoutChannelCode } from "../pay.types";

export type PayslipStore = ReturnType<typeof usePayslips>;

function toPayslip(row: PayslipRow): Payslip {
  return {
    id: row.id,
    helperId: row.helper_id,
    cutoffStart: row.cutoff_start,
    cutoffEnd: row.cutoff_end,
    basePay: Number(row.base_pay),
    statutoryEmployeeShare: Number(row.statutory_employee_share),
    valeDeductions: Number(row.vale_deductions),
    netPay: Number(row.net_pay),
    payoutChannelCode: row.payout_channel_code,
    payoutStatus: row.payout_status,
    failureReason: row.failure_reason,
    requestedAt: row.requested_at,
    confirmedAt: row.confirmed_at,
  };
}

/**
 * Payslip history + payout initiation. Real Supabase-backed as of
 * KNOWN_GAPS.md gap #9's close -- write-then-refresh, same pattern as
 * useVales/useLedger. payNow() surfaces its thrown error to the caller
 * (rather than swallowing it like useVales' fire-and-forget handlers)
 * since the manager needs to see *why* a payout failed, not just a generic
 * toast -- see the Pay Now button's own try/catch in the Money tab UI.
 */
export function usePayslips({ token, ready }: { token: string | null; ready: boolean }) {
  const [payslips, setPayslips] = useState<Payslip[]>([]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const rows = await listPayslipsFn({ data: { token } });
    setPayslips(rows.map(toPayslip));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => {
      console.error("[usePayslips] Failed to load payslips:", err);
    });
  }, [ready, token, refresh]);

  /**
   * A payout's terminal status arrives by WEBHOOK, minutes after the manager
   * clicked Pay -- `initiate_payslip` returns while Xendit is still working, so
   * `payNow`'s own refresh only ever sees `processing`. Nothing else refetched,
   * so the Money tab kept showing "sending" for a payout that had actually
   * succeeded until the manager happened to reload the page. First seen
   * 2026-08-17, when payouts started reaching `succeeded` at all (C35/C44).
   *
   * Polled rather than subscribed: Supabase Realtime would need `payslips`
   * added to the publication -- a migration, and one that widens what is
   * broadcast on a money table -- to save a query every 15 seconds that only
   * runs while something is genuinely in flight. If payouts ever become
   * frequent enough for that to matter, `enable-realtime-quick-utos-tickets.sql`
   * is the precedent to copy.
   *
   * Only `pending_send`/`processing` are worth waiting on. `needs_review` is
   * terminal until a human acts, and polling would never change it.
   */
  const hasInFlight = payslips.some(
    (p) => p.payoutStatus === "pending_send" || p.payoutStatus === "processing",
  );

  useEffect(() => {
    if (!ready || !token || !hasInFlight) return;

    const id = setInterval(() => {
      refresh().catch((err) => {
        console.error("[usePayslips] In-flight payout poll failed:", err);
      });
    }, 15_000);

    return () => clearInterval(id);
  }, [ready, token, hasInFlight, refresh]);

  const payNow = async (helperId: string, channelCode: PayoutChannelCode) => {
    if (!token) {
      toast.error("Hindi ka naka-sign in — hindi ma-initiate ang payout.");
      throw new Error("Not authenticated");
    }
    try {
      const result = await initiatePayoutFn({ data: { token, helperId, channelCode } });
      await refresh();
      return result;
    } catch (err) {
      await refresh();
      throw err;
    }
  };

  return { payslips, refresh, payNow };
}
