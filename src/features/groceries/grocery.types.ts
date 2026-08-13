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
 * and the household's petty-cash budget. It deliberately does not expose a
 * way to mark something bought, set its cost, or attach a receipt: that's
 * shopping execution, which belongs to the helper on LINARA_MOBILE, not a
 * manager's browser session (see KNOWN_GAPS.md Closed Gap C13).
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
  addManual: (name: string, qty: number, unit: string) => void;
  setBudget: (n: number) => void;
  /** Only meaningful for a not-yet-bought item -- curating the plan, not
   * erasing a helper's completed purchase. */
  remove: (item: GroceryItem) => void;
};
