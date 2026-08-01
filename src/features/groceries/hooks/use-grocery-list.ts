import { useEffect, useMemo, useState } from "react";

import type { PantryStore } from "@/features/pantry/hooks/use-pantry";
import { isPalengke } from "@/features/tasks/task.utils";

import { RECEIPT_PLACEHOLDER } from "../grocery.constants";
import type { GroceryContextValue, GroceryItem } from "../grocery.types";

const isSuggestion = (item: GroceryItem) => item.id.startsWith("sug-");

/**
 * The grocery list, its petty-cash budget, and the receipt slot.
 *
 * The displayed list is the manual items plus auto-suggestions derived from low
 * pantry stock, so buying a suggested item both records the spend and restocks
 * the pantry. Returns the context value plus the modal's own open state, which
 * the provider owns because the modal is mounted once at the app root.
 */
export function useGroceryList(pantry: PantryStore): {
  value: GroceryContextValue;
  modalOpen: boolean;
  closeModal: () => void;
} {
  const [items, setItems] = useState<GroceryItem[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [budget, setBudget] = useState(1500);
  const [receiptPhoto, setReceiptPhoto] = useState<string | null>(null);

  const pantryItems = pantry.items;
  const adjustPantry = pantry.adjust;

  // Auto-derived suggestions: low pantry items not already in grocery and not dismissed.
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
    if (!name.trim()) return;
    setItems((prev) => [
      ...prev,
      { id: `g${Date.now()}`, name: name.trim(), qty, unit: unit.trim() || "pcs", bought: false },
    ]);
  };

  const toggleBought = (item: GroceryItem) => {
    if (isSuggestion(item)) {
      // Promote suggestion into state as bought AND bump pantry.
      setItems((prev) => [...prev, { ...item, id: `g${Date.now()}`, bought: true }]);
      if (item.pantryItemId) adjustPantry(item.pantryItemId, item.qty);
      return;
    }
    // Existing state item — flip bought and adjust pantry accordingly.
    setItems((prev) =>
      prev.map((g) =>
        g.id === item.id
          ? { ...g, bought: !g.bought, costPHP: g.bought ? undefined : g.costPHP }
          : g,
      ),
    );
    if (item.pantryItemId) adjustPantry(item.pantryItemId, item.bought ? -item.qty : item.qty);
  };

  const setCost = (item: GroceryItem, cost: number | undefined) => {
    if (isSuggestion(item)) return;
    setItems((prev) => prev.map((g) => (g.id === item.id ? { ...g, costPHP: cost } : g)));
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
    // If already marked bought, roll back the pantry bump so counts stay honest.
    if (item.bought && item.pantryItemId) adjustPantry(item.pantryItemId, -item.qty);
    setItems((prev) => prev.filter((g) => g.id !== item.id));
  };

  const value: GroceryContextValue = {
    display,
    toBuyCount: display.filter((g) => !g.bought).length,
    budget,
    spent,
    remaining: budget - spent,
    receiptPhoto,
    addManual,
    toggleBought,
    setCost,
    setBudget: (n) => setBudget(Math.max(0, n)),
    attachReceipt: () => setReceiptPhoto(RECEIPT_PLACEHOLDER),
    clearReceipt: () => setReceiptPhoto(null),
    remove,
    isPalengkeTask: isPalengke,
    openModal: () => setModalOpen(true),
  };

  return { value, modalOpen, closeModal: () => setModalOpen(false) };
}
