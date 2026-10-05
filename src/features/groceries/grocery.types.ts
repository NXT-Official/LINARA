export type GroceryItem = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  pantryItemId?: string; // set when it was auto-suggested from pantry
  bought: boolean; // set for real by LINARA_MOBILE -- this app only reads it
  costPHP?: number; // actual cost entered by the helper on mobile when bought
};

/**
 * Read-mostly grocery state for the manager's Pantry tab and Money tab.
 * `bought`/`costPHP` are real (LINARA_MOBILE writes them) -- this app only
 * curates the *planned* list (addManual/remove, for items not yet bought)
 * and the household's petty-cash budget. Costs are still entered only on
 * LINARA_MOBILE (C13), but a manager who did the shopping herself can tick
 * items bought (LW-5) and add the receipt (KNOWN_GAPS.md O29).
 */
export type GroceryContextValue = {
  display: GroceryItem[]; // merged: real items + auto-suggestions
  toBuyCount: number;
  budget: number;
  spent: number;
  remaining: number;
  /** The active Palengke ticket's uploaded photo, if any -- sourced from
   * tickets.photo_evidence_url via the board (see use-grocery-list.ts), not
   * from grocery_items, which has no photo column (see gap #2's writeup on
   * why a receipt naturally covers many items, not one row). */
  receiptPhoto: string | null;
  /** Receipts snapped from the app after buying, newest first (any day). */
  receipts: {
    id: string;
    url: string;
    thumbUrl: string | null;
    createdAt: string;
    byName: string | null;
  }[];
  /** Shrinks and uploads a receipt the manager took; rejects on failure. */
  addReceipt: (file: File) => Promise<void>;
  addManual: (name: string, qty: number, unit: string) => void;
  /** Puts a low-stock suggestion on the real list, so her app shows it too. */
  addSuggestion: (item: GroceryItem) => void;
  /** Fixes a not-yet-bought item's name or amount. */
  edit: (item: GroceryItem, patch: { name: string; qty: number; unit: string }) => void;
  refresh: () => Promise<void>;
  setBudget: (n: number) => void;
  /** Only meaningful for a not-yet-bought item -- curating the plan, not
   * erasing a helper's completed purchase. */
  remove: (item: GroceryItem) => void;
  /** Ticks a listed item bought, or unticks it. Not for suggestions. */
  toggleBought: (item: GroceryItem) => void;
};
