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
