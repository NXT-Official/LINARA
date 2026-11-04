import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { decideValeFn, insertValeFn, listValesFn, type ValeRow } from "../ledger.actions";
import type { ValeRequest } from "../ledger.types";
import { useT } from "@/lib/i18n/locale-context";

export type ValeStore = ReturnType<typeof useVales>;

function toValeRequest(row: ValeRow): ValeRequest {
  return {
    id: row.id,
    helperId: row.helper_id,
    amount: Number(row.amount),
    reason: row.reason,
    status: row.status,
    settledInPayslipId: row.settled_in_payslip_id,
  };
}

/**
 * Cash-advance requests: the helper asks, any manager approves or declines.
 * Real Supabase-backed as of KNOWN_GAPS.md Closed Gap C9 -- request()/decide()
 * write through to `vales` and refetch, same pattern as useSchedules' update().
 * Errors are caught and toasted here rather than left to callers, since the
 * approve/decline buttons in NeedsYou call these as plain fire-and-forget
 * handlers (no await, matching their pre-existing UX). Helpers ask from the
 * mobile app; request() has no web caller since the web's helper form went.
 */
export function useVales({ token, ready }: { token: string | null; ready: boolean }) {
  const t = useT();
  const [vales, setVales] = useState<ValeRequest[]>([]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const rows = await listValesFn({ data: { token } });
    setVales(rows.map(toValeRequest));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => {
      console.error("[useVales] Failed to load vales:", err);
    });
  }, [ready, token, refresh]);

  const request = async (helperId: string, amount: number, reason: string) => {
    if (!token) {
      toast.error(t("ledger.hindiKaNakaSignIn"));
      return;
    }
    try {
      await insertValeFn({ data: { token, helperId, amount, reason } });
      await refresh();
    } catch (err) {
      console.error("[useVales] Failed to submit vale request:", err);
      toast.error(t("ledger.hindiNaSendAngVale"));
    }
  };

  const decide = async (id: string, decision: "approved" | "declined") => {
    if (!token) {
      toast.error(t("ledger.hindiKaNakaSignIn2"));
      return;
    }
    try {
      await decideValeFn({ data: { token, valeId: id, decision } });
      await refresh();
    } catch (err) {
      console.error("[useVales] Failed to decide vale request:", err);
      toast.error(t("ledger.hindiNaSaveAngDesisyon"));
    }
  };

  return { vales, refresh, request, decide };
}
