import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  deletePantryItemFn,
  insertPantryItemFn,
  listPantryItemsFn,
  updatePantryItemQtyFn,
  type PantryItemRow,
} from "../pantry.actions";
import type { PantryItem } from "../pantry.types";

export type PantryStore = {
  items: PantryItem[];
  adjust: (id: string, delta: number) => void;
  setQty: (id: string, qty: number) => void;
  add: (item: Omit<PantryItem, "id">) => void;
  remove: (id: string) => void;
  refresh: () => Promise<void>;
};

function toPantryItem(row: PantryItemRow): PantryItem {
  return {
    id: row.id,
    name: row.name,
    qty: Number(row.qty),
    unit: row.unit,
    par: Number(row.par),
    category: row.category as PantryItem["category"],
  };
}

/**
 * Household stock levels -- real Supabase-backed as of KNOWN_GAPS.md Closed
 * Gap C23. `items` is fetched on mount/token change and refetched after every
 * write, same "write then refresh" pattern as useVales/useLedger/useUtos/
 * useGroceryList. Quantities still round to 2dp and never go below zero,
 * same invariant the old local-only mock enforced.
 */
export function usePantry({ token, ready }: { token: string | null; ready: boolean }): PantryStore {
  const [items, setItems] = useState<PantryItem[]>([]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const rows = await listPantryItemsFn({ data: { token } });
    setItems(rows.map(toPantryItem));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => {
      console.error("[usePantry] Failed to load pantry:", err);
    });
  }, [ready, token, refresh]);

  const setQty = (id: string, qty: number) => {
    if (!token) return;
    const clamped = Math.max(0, Math.round(qty * 100) / 100);
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, qty: clamped } : p)));
    updatePantryItemQtyFn({ data: { token, itemId: id, qty: clamped } })
      .then(() => refresh())
      .catch((err) => {
        console.error("[usePantry] Failed to update pantry qty:", err);
        toast.error("Hindi na-save ang pantry item.");
        refresh().catch(() => {});
      });
  };

  const adjust = (id: string, delta: number) => {
    const current = items.find((p) => p.id === id);
    if (!current) return;
    setQty(id, current.qty + delta);
  };

  const add = (item: Omit<PantryItem, "id">) => {
    if (!token || !item.name.trim()) return;
    insertPantryItemFn({
      data: {
        token,
        name: item.name.trim(),
        qty: item.qty,
        unit: item.unit.trim() || "pcs",
        par: item.par,
        category: item.category,
      },
    })
      .then(() => refresh())
      .catch((err) => {
        console.error("[usePantry] Failed to add pantry item:", err);
        toast.error("Hindi na-add ang pantry item.");
      });
  };

  const remove = (id: string) => {
    if (!token) return;
    setItems((prev) => prev.filter((p) => p.id !== id));
    deletePantryItemFn({ data: { token, itemId: id } })
      .then(() => refresh())
      .catch((err) => {
        console.error("[usePantry] Failed to remove pantry item:", err);
        toast.error("Hindi na-remove ang pantry item.");
        refresh().catch(() => {});
      });
  };

  return { items, adjust, setQty, add, remove, refresh };
}
