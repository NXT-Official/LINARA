import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { PantryStore } from "@/features/pantry/hooks/use-pantry";

import {
  deleteGroceryItemFn,
  getHouseholdBudgetFn,
  insertGroceryItemFn,
  listGroceryItemsFn,
  updateHouseholdBudgetFn,
  type GroceryItemRow,
} from "../grocery.actions";
import type { GroceryContextValue, GroceryItem } from "../grocery.types";

const isSuggestion = (item: GroceryItem) => item.id.startsWith("sug-");

function toGroceryItem(row: GroceryItemRow): GroceryItem {
  return {
    id: row.id,
    name: row.name,
    qty: Number(row.qty),
    unit: row.unit,
    pantryItemId: row.pantry_item_id ?? undefined,
    bought: row.bought,
    costPHP: row.actual_cost ?? undefined,
  };
}

/**
 * The grocery list and its petty-cash budget -- real Supabase-backed as of
 * KNOWN_GAPS.md Closed Gap C13. `items`/`budget` are fetched on mount/token
 * change and refetched after every write, same "write then refresh" pattern
 * as useVales/useLedger/useUtos/useTaskBoard. `receiptPhoto` isn't fetched
 * here at all -- it's threaded in from the board's own already-real `tasks`
 * (see app-store-provider.tsx), since a Palengke receipt lives on
 * `tickets.photo_evidence_url`, not on any grocery_items row.
 *
 * The displayed list is the real items plus auto-suggestions derived from
 * low pantry stock (suggestions stay purely local/informational -- adding
 * one for real is just addManual).
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
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [budget, setBudgetState] = useState(1500);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  const pantryItems = pantry.items;

  const refresh = useCallback(async () => {
    if (!token) return;
    const [rows, householdBudget] = await Promise.all([
      listGroceryItemsFn({ data: { token } }),
      getHouseholdBudgetFn({ data: { token } }),
    ]);
    setItems(rows.map(toGroceryItem));
    setBudgetState(householdBudget.budget);
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => {
      console.error("[useGroceryList] Failed to load groceries:", err);
    });
  }, [ready, token, refresh]);

  // Auto-derived suggestions: low pantry items not already in the real list and not dismissed.
  const display = useMemo<GroceryItem[]>(() => {
    const covered = new Set(items.map((g) => g.pantryItemId).filter(Boolean) as string[]);
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
    return [...items, ...suggestions];
  }, [items, pantryItems, dismissedSuggestions]);

  const spent = useMemo(
    () => items.filter((g) => g.bought).reduce((s, g) => s + (g.costPHP ?? 0), 0),
    [items],
  );

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

  const addManual = (name: string, qty: number, unit: string) => {
    if (!name.trim() || !token) return;
    insertGroceryItemFn({ data: { token, name: name.trim(), qty, unit: unit.trim() || "pcs" } })
      .then(() => refresh())
      .catch((err) => {
        console.error("[useGroceryList] Failed to add grocery item:", err);
        toast.error("Hindi na-add ang grocery item.");
      });
  };

  const remove = (item: GroceryItem) => {
    if (isSuggestion(item)) {
      // Dismiss this suggestion until pantry qty changes and it re-qualifies.
      if (item.pantryItemId) {
        const pantryItemId = item.pantryItemId;
        setDismissedSuggestions((prev) => new Set(prev).add(pantryItemId));
      }
      return;
    }
    if (!token) return;
    deleteGroceryItemFn({ data: { token, itemId: item.id } })
      .then(() => refresh())
      .catch((err) => {
        console.error("[useGroceryList] Failed to remove grocery item:", err);
        toast.error("Hindi na-remove ang grocery item.");
      });
  };

  const setBudget = (n: number) => {
    if (!token) return;
    updateHouseholdBudgetFn({ data: { token, budget: Math.max(0, n) } })
      .then(() => refresh())
      .catch((err) => {
        console.error("[useGroceryList] Failed to update budget:", err);
        toast.error("Hindi na-save ang budget.");
      });
  };

  return {
    display,
    toBuyCount: display.filter((g) => !g.bought).length,
    budget,
    spent,
    remaining: budget - spent,
    receiptPhoto,
    addManual,
    setBudget,
    remove,
  };
}
