import { useCallback, useEffect, useRef, useState } from "react";

import { getBillingFn } from "../billing.actions";
import type { BillingSnapshot } from "../billing.types";

export type BillingStatus = "loading" | "ready" | "error" | "unavailable";
export type BillingStore = ReturnType<typeof useBilling>;

/**
 * The household's plan, seats in use, subscriptions and invoices. Hand-rolled
 * like use-payslips.ts. A failed refetch keeps what is already on screen: the
 * page only shows its error state when it has nothing to show.
 */
export function useBilling({
  token,
  householdId,
  ready,
}: {
  token: string | null;
  householdId: string | null;
  ready: boolean;
}) {
  const [state, setState] = useState<{ status: BillingStatus; data: BillingSnapshot | null }>({
    status: "loading",
    data: null,
  });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!token || !householdId) return;
    try {
      const data = await getBillingFn({ data: { token, householdId } });
      if (!alive.current) return;
      setState({ status: data.available ? "ready" : "unavailable", data });
    } catch {
      if (!alive.current) return;
      setState((prev) => (prev.data ? prev : { status: "error", data: null }));
    }
  }, [token, householdId]);

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh]);

  return { status: state.status, data: state.data, refresh };
}
