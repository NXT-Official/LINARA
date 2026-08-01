import { useState } from "react";

import { INITIAL_PANTRY } from "../pantry.constants";
import type { PantryItem } from "../pantry.types";

export type PantryStore = {
  items: PantryItem[];
  adjust: (id: string, delta: number) => void;
  setQty: (id: string, qty: number) => void;
  add: (item: Omit<PantryItem, "id">) => void;
  remove: (id: string) => void;
};

/** Household stock levels. Quantities round to 2dp and never go below zero. */
export function usePantry(): PantryStore {
  const [items, setItems] = useState<PantryItem[]>(INITIAL_PANTRY);

  const adjust = (id: string, delta: number) =>
    setItems((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, qty: Math.max(0, Math.round((p.qty + delta) * 100) / 100) } : p,
      ),
    );

  const setQty = (id: string, qty: number) =>
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, qty: Math.max(0, qty) } : p)));

  const add = (item: Omit<PantryItem, "id">) =>
    setItems((prev) => [...prev, { ...item, id: `p${Date.now()}` }]);

  const remove = (id: string) => setItems((prev) => prev.filter((p) => p.id !== id));

  return { items, adjust, setQty, add, remove };
}
