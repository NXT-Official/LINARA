import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { decideValeFn, insertValeFn, listValesFn, type ValeRow } from "../ledger.actions";
import type { ValeRequest } from "../ledger.types";

export type ValeStore = ReturnType<typeof useVales>;

function toValeRequest(row: ValeRow): ValeRequest {
  return {
    id: row.id,
    helperId: row.helper_id,
    amount: Number(row.amount),
    reason: row.reason,
    status: row.status,
  };
}

/**
 * Cash-advance requests: the helper asks, any manager approves or declines.
 * Real Supabase-backed as of KNOWN_GAPS.md Closed Gap C9 -- request()/decide()
 * write through to `vales` and refetch, same pattern as useSchedules' update().
 * Errors are caught and toasted here rather than left to callers, since both
 * ValeRequestModal and the approve/decline buttons in NeedsYou call these as
 * plain fire-and-forget handlers (no await, matching their pre-existing UX).
 */
export function useVales({ token, ready }: { token: string | null; ready: boolean }) {
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
      toast.error("Hindi ka naka-sign in — hindi ma-send ang vale request.");
      return;
    }
    try {
      await insertValeFn({ data: { token, helperId, amount, reason } });
      await refresh();
    } catch (err) {
      console.error("[useVales] Failed to submit vale request:", err);
      toast.error("Hindi na-send ang vale request. Subukan ulit.");
    }
  };

  const decide = async (id: string, decision: "approved" | "declined") => {
    if (!token) {
      toast.error("Hindi ka naka-sign in — hindi ma-update ang vale request.");
      return;
    }
    try {
      await decideValeFn({ data: { token, valeId: id, decision } });
      await refresh();
    } catch (err) {
      console.error("[useVales] Failed to decide vale request:", err);
      toast.error("Hindi na-save ang desisyon sa vale request.");
    }
  };

  return { vales, refresh, request, decide };
}
