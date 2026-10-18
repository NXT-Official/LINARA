import { useCallback, useEffect, useState } from "react";

import { useAppStores } from "@/features/dashboard/app-store-context";

import { listGroceryHistoryFn } from "../grocery-runs.actions";
import type { GroceryHistory } from "../grocery.types";
import { monthBounds } from "../grocery.utils";

const EMPTY: GroceryHistory = { runs: [], outside: [], outsideReceipts: [] };

/**
 * One month of grocery history, fetched when that month is shown: runs
 * closed in it (with their lines and receipts) and what was bought straight
 * from the pool. A month at a time, so years of runs never load at once.
 */
export function useGroceryHistory(month: Date) {
  const { session } = useAppStores();
  const token = session.token;
  const [history, setHistory] = useState<GroceryHistory>(EMPTY);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const from = monthBounds(month).start.toISOString();
  const to = monthBounds(month).end.toISOString();

  const refresh = useCallback(async () => {
    if (!token) return;
    setState("loading");
    try {
      setHistory(await listGroceryHistoryFn({ data: { token, from, to } }));
      setState("ready");
    } catch (err) {
      console.error("[useGroceryHistory] Failed to load history:", err);
      setState("error");
    }
  }, [token, from, to]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { history, state, refresh };
}
