import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  deletePantryItemFn,
  insertPantryItemFn,
  listPantryItemsFn,
  updatePantryItemQtyFn,
  type PantryItemRow,
} from "../pantry.actions";
import type { PantryCategory, PantryItem } from "../pantry.types";

function toPantryItem(row: PantryItemRow): PantryItem {
  return {
    id: row.id,
    name: row.name,
    qty: Number(row.qty),
    unit: row.unit,
    par: Number(row.par),
    category: row.category as PantryCategory,
  };
}

export type PantryStore = {
  items: PantryItem[];
  adjust: (id: string, delta: number) => void;
  setQty: (id: string, qty: number) => void;
  add: (item: Omit<PantryItem, "id">) => void;
  remove: (id: string) => void;
  refresh: () => Promise<void>;
};

/**
 * Household stock levels -- real Supabase-backed (`pantry_items`) as of
 * KNOWN_GAPS.md Closed Gap C23. Fetched on mount/token change and refetched
 * after every write, same "write then refresh" pattern as useGroceryList/
 * useVales/useLedger. Quantities round to 2dp and never go below zero.
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
      console.error("[usePantry] Failed to load pantry items:", err);
    });
  }, [ready, token, refresh]);

  const setQty = (id: string, qty: number) => {
    if (!token) return;
    const next = Math.max(0, Math.round(qty * 100) / 100);
    updatePantryItemQtyFn({ data: { token, itemId: id, qty: next } })
      .then(() => refresh())
      .catch((err) => {
        console.error("[usePantry] Failed to update quantity:", err);
        toast.error("Hindi na-save ang dami.");
      });
  };

  const adjust = (id: string, delta: number) => {
    const current = items.find((p) => p.id === id);
    if (!current) return;
    setQty(id, current.qty + delta);
  };

  const add = (item: Omit<PantryItem, "id">) => {
    if (!token) return;
    insertPantryItemFn({ data: { token, ...item } })
      .then(() => refresh())
      .catch((err) => {
        console.error("[usePantry] Failed to add pantry item:", err);
        toast.error("Hindi na-add ang pantry item.");
      });
  };

  const remove = (id: string) => {
    if (!token) return;
    deletePantryItemFn({ data: { token, itemId: id } })
      .then(() => refresh())
      .catch((err) => {
        console.error("[usePantry] Failed to remove pantry item:", err);
        toast.error("Hindi na-remove ang pantry item.");
      });
  };

  return { items, adjust, setQty, add, remove, refresh };
}
