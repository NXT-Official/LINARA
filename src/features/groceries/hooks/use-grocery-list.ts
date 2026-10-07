import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { PantryStore } from "@/features/pantry/hooks/use-pantry";
import { shrinkPhoto } from "@/lib/shrink-photo";

import {
  addGroceryReceiptFn,
  deleteGroceryItemFn,
  insertGroceryItemFn,
  listGroceryReceiptsFn,
  setGroceryItemBoughtFn,
  setGroceryItemCostFn,
  updateGroceryItemFn,
  updateHouseholdBudgetFn,
} from "../grocery.actions";
import {
  deleteGroceryRunFn,
  deleteGroceryTemplateFn,
  listGroceryBoardFn,
  moveGroceryItemsFn,
  saveGroceryRunFn,
  saveGroceryTemplateFn,
  setGroceryBudgetFn,
  setGroceryRunStatusFn,
  startGroceryTemplateFn,
  type GroceryBoard,
} from "../grocery-runs.actions";
import type { GroceryContextValue, GroceryItem, GroceryReceipt } from "../grocery.types";
import { monthBounds, startOfDay } from "../grocery.utils";

const isSuggestion = (item: GroceryItem) => item.id.startsWith("sug-");

const EMPTY: GroceryBoard = {
  available: false,
  items: [],
  runs: [],
  templates: [],
  budgets: { house: null, byTeam: {} },
  month: { total: 0, byTeam: {}, noTeam: 0 },
};

/**
 * The palengke (supabase/add-grocery-runs.sql, KNOWN_GAPS.md O40): the
 * Needed pool, open runs and their lines, repeats, budgets and this month's
 * spend, fetched together and refetched after every write -- the same
 * "write then refresh" pattern as the other stores. `receiptPhoto` comes in
 * from the board's own tasks (a Palengke task's Done photo).
 *
 * The pool shown is the real lines plus suggestions from low pantry stock.
 * A suggestion is local to this browser until someone adds it.
 */
export function useGroceryList({
  pantry,
  token,
  ready,
  receiptPhoto,
}: {
  pantry: PantryStore;
  token: string | null;
  ready: boolean;
  receiptPhoto: string | null;
}): GroceryContextValue {
  const [board, setBoard] = useState<GroceryBoard>(EMPTY);
  const [receipts, setReceipts] = useState<GroceryReceipt[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  const pantryItems = pantry.items;

  const refresh = useCallback(async () => {
    if (!token) return;
    const now = new Date();
    setBoard(
      await listGroceryBoardFn({
        data: {
          token,
          monthStart: monthBounds(now).start.toISOString(),
          dayStart: startOfDay(now).toISOString(),
        },
      }),
    );
    // Separate so a receipt problem never blanks the list.
    listGroceryReceiptsFn({ data: { token } })
      .then(setReceipts)
      .catch((err) => console.error("[useGroceryList] Failed to load receipts:", err));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => {
      console.error("[useGroceryList] Failed to load groceries:", err);
    });
  }, [ready, token, refresh]);

  const { pool, itemsByRun } = useMemo(() => {
    const byRun = new Map<string, GroceryItem[]>();
    const inPool: GroceryItem[] = [];
    for (const g of board.items) {
      if (g.runId) byRun.set(g.runId, [...(byRun.get(g.runId) ?? []), g]);
      else inPool.push(g);
    }
    return { pool: inPool, itemsByRun: byRun };
  }, [board.items]);

  // Suggestions: low pantry items not already listed anywhere, and not dismissed.
  const needed = useMemo<GroceryItem[]>(() => {
    const covered = new Set(
      board.items.filter((g) => !g.bought && g.pantryItemId).map((g) => g.pantryItemId as string),
    );
    const suggestions: GroceryItem[] = pantryItems
      .filter((p) => p.qty <= p.par && !covered.has(p.id) && !dismissedSuggestions.has(p.id))
      .map((p) => ({
        id: `sug-${p.id}`,
        name: p.name,
        qty: Math.max(1, Math.round((p.par - p.qty) * 100) / 100),
        unit: p.unit,
        pantryItemId: p.id,
        bought: false,
      }));
    return [...pool, ...suggestions];
  }, [board.items, pool, pantryItems, dismissedSuggestions]);

  // Clear dismissals if the pantry item is no longer low (so a fresh dip re-suggests).
  useEffect(() => {
    setDismissedSuggestions((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        const p = pantryItems.find((x) => x.id === id);
        if (!p || p.qty > p.par) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pantryItems]);

  /** Runs a write, then refreshes; a failure is toasted with `failMsg` and rethrown. */
  const write = useCallback(
    async <T>(work: () => Promise<T>, failMsg: string, alsoPantry = false): Promise<T> => {
      try {
        const out = await work();
        await Promise.all([refresh(), alsoPantry ? pantry.refresh() : null]);
        return out;
      } catch (err) {
        console.error(`[useGroceryList] ${failMsg}`, err);
        toast.error(err instanceof Error && err.message ? err.message : failMsg);
        throw err;
      }
    },
    [refresh, pantry],
  );
  // For the fire-and-forget ones: the toast already said what went wrong.
  const quiet = (p: Promise<unknown>) => void p.catch(() => {});

  const runForTask = useCallback(
    (taskId: string) => board.runs.find((r) => r.ticketId === taskId),
    [board.runs],
  );

  const spent = board.month.total;
  const budget = board.budgets.house ?? 0;

  return {
    runsAvailable: board.available,
    needed,
    toBuyCount: needed.filter((g) => !g.bought).length,
    runs: board.runs,
    itemsByRun,
    runForTask,
    templates: board.templates,
    budgets: board.budgets,
    month: board.month,
    spent,
    budget,
    remaining: budget - spent,
    receiptPhoto,
    receipts,
    refresh,

    addReceipt: async (file, runId) => {
      if (!token) throw new Error("Not signed in.");
      const { photo, thumb } = await shrinkPhoto(file);
      await addGroceryReceiptFn({ data: { token, photo, thumb, runId } });
      setReceipts(await listGroceryReceiptsFn({ data: { token } }));
    },
    addManual: (name, qty, unit, runId) => {
      if (!name.trim() || !token) return;
      quiet(
        write(
          () =>
            insertGroceryItemFn({
              data: { token, name: name.trim(), qty, unit: unit.trim() || "pcs", runId },
            }),
          "Couldn't add the item.",
        ),
      );
    },
    addSuggestion: async (item, runId) => {
      if (!token || !item.pantryItemId) return;
      const pantryItemId = item.pantryItemId;
      await write(
        () =>
          insertGroceryItemFn({
            data: { token, name: item.name, qty: item.qty, unit: item.unit, pantryItemId, runId },
          }),
        "Couldn't add the item.",
      );
    },
    edit: (item, patch) => {
      if (!token || isSuggestion(item) || !patch.name.trim()) return;
      quiet(
        write(
          () =>
            updateGroceryItemFn({
              data: {
                token,
                itemId: item.id,
                name: patch.name.trim(),
                qty: patch.qty,
                unit: patch.unit.trim() || "pcs",
              },
            }),
          "Couldn't save the item.",
        ),
      );
    },
    remove: (item) => {
      if (isSuggestion(item)) {
        // Dismissed until the pantry count changes and it qualifies again.
        if (item.pantryItemId) {
          const pantryItemId = item.pantryItemId;
          setDismissedSuggestions((prev) => new Set(prev).add(pantryItemId));
        }
        return;
      }
      if (!token) return;
      quiet(
        write(
          () => deleteGroceryItemFn({ data: { token, itemId: item.id } }),
          "Couldn't remove the item.",
        ),
      );
    },
    // The pantry count follows in the database (add-grocery-restock.sql).
    toggleBought: (item) => {
      if (!token || isSuggestion(item)) return;
      quiet(
        write(
          () => setGroceryItemBoughtFn({ data: { token, itemId: item.id, bought: !item.bought } }),
          "Couldn't update the item. Try again.",
          true,
        ),
      );
    },
    setCost: (item, cost) => {
      if (!token || isSuggestion(item)) return;
      quiet(
        write(
          () => setGroceryItemCostFn({ data: { token, itemId: item.id, cost } }),
          "Couldn't save the cost.",
        ),
      );
    },
    moveItems: async (itemIds, runId) => {
      if (!token || itemIds.length === 0) return;
      await write(
        () => moveGroceryItemsFn({ data: { token, itemIds, runId } }),
        "Couldn't move those items.",
      );
    },

    saveRun: async (draft, opts) => {
      if (!token) throw new Error("Not signed in.");
      const { id } = await write(
        () => saveGroceryRunFn({ data: { token, draft, ...opts } }),
        "Couldn't save the run.",
      );
      return id;
    },
    setRunStatus: async (run, status, money) => {
      if (!token) return;
      await write(
        () => setGroceryRunStatusFn({ data: { token, id: run.id, status, ...money } }),
        "Couldn't update the run.",
      );
    },
    deleteRun: async (run) => {
      if (!token) return;
      await write(() => deleteGroceryRunFn({ data: { token, id: run.id } }), "Couldn't delete it.");
    },

    saveTemplate: async (draft, id) => {
      if (!token) return;
      await write(
        () => saveGroceryTemplateFn({ data: { token, draft, id } }),
        "Couldn't save the repeat.",
      );
    },
    deleteTemplate: async (id) => {
      if (!token) return;
      await write(
        () => deleteGroceryTemplateFn({ data: { token, id } }),
        "Couldn't delete the repeat.",
      );
    },
    startTemplate: async (id, shopOn) => {
      if (!token) throw new Error("Not signed in.");
      const out = await write(
        () => startGroceryTemplateFn({ data: { token, id, shopOn } }),
        "Couldn't start the run.",
      );
      return out.id;
    },

    setBudget: async (teamId, amount) => {
      if (!token) return;
      // Before add-grocery-runs.sql there is only the one household number.
      await write(async () => {
        if (board.available) await setGroceryBudgetFn({ data: { token, teamId, amount } });
        else await updateHouseholdBudgetFn({ data: { token, budget: Math.max(0, amount ?? 0) } });
      }, "Couldn't save the budget.");
    },
  };
}
