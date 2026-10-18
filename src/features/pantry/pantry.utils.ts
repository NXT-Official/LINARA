import type { PantryCategory, PantryItem } from "./pantry.types";

/**
 * What each stored category is called on screen. "Pantry" is the stored value
 * (`pantry_items.category`'s CHECK), but next to a section called Pantry it
 * says nothing, so it shows as dry goods.
 */
export const CATEGORY_LABEL: Record<PantryCategory, string> = {
  "Rice & grains": "Rice & grains",
  Fresh: "Fresh",
  Pantry: "Dry goods & sauces",
  Cleaning: "Cleaning",
  Baby: "Baby",
};

export type StockState = "out" | "low" | "ok";

/**
 * Out at zero, low under the keep-at-least amount (`par`), otherwise fine.
 * Under, not at: the suggested buy is `par - qty`, so a line bought as
 * suggested lands on `par` and has to count as enough, or it would go
 * straight back on the list (decided 2026-10-07; LINARA_MOBILE lib/pantry.ts
 * matches).
 */
export function stockState(item: Pick<PantryItem, "qty" | "par">): StockState {
  if (item.qty <= 0) return "out";
  return item.qty < item.par ? "low" : "ok";
}

/** Out or low: counted as running low, and suggested for the grocery list. */
export const needsBuying = (item: Pick<PantryItem, "qty" | "par">) => stockState(item) !== "ok";

// English on the manager web until its Filipino toggle exists; the helper app
// keeps "Ubos" / "Paubos" (decision 2026-10-07).
export const STOCK_LABEL: Record<Exclude<StockState, "ok">, string> = {
  out: "Out",
  low: "Running low",
};

// Plural units the starter list uses, and anyone typing "packs" by hand.
const PLURAL_UNITS = new Set(["packs", "bottles", "cans", "bars", "rolls", "heads", "boxes"]);

/** "1 pack", "2 packs", "1 pc": drops a plural unit's "s" at exactly one. Other units as typed. */
export function unitFor(n: number, unit: string): string {
  if (n === 1 && unit.toLowerCase() === "pcs") return unit.slice(0, -1);
  if (n !== 1 || !PLURAL_UNITS.has(unit.toLowerCase())) return unit;
  return unit.toLowerCase() === "boxes" ? unit.slice(0, -2) : unit.slice(0, -1);
}

/** The heading a grocery item sits under: its pantry item's category, else "Other". */
export type GrocerySection = { key: PantryCategory | "other"; label: string };

/**
 * Splits a grocery list into sections in pantry order, using the category of
 * the pantry item each line restocks. Lines added by hand go under Other.
 * Empty sections are left out; order within a section is kept.
 */
export function groupByPantryCategory<T extends { pantryItemId?: string }>(
  items: T[],
  pantry: Pick<PantryItem, "id" | "category">[],
  order: readonly PantryCategory[],
): { section: GrocerySection; items: T[] }[] {
  const categoryOf = new Map(pantry.map((p) => [p.id, p.category]));
  const sections: { section: GrocerySection; items: T[] }[] = [
    ...order.map((c) => ({ section: { key: c, label: CATEGORY_LABEL[c] }, items: [] as T[] })),
    { section: { key: "other" as const, label: "Other" }, items: [] as T[] },
  ];
  for (const item of items) {
    const category = item.pantryItemId ? categoryOf.get(item.pantryItemId) : undefined;
    const target = sections.find((s) => s.section.key === (category ?? "other"));
    (target ?? sections[sections.length - 1]).items.push(item);
  }
  return sections.filter((s) => s.items.length > 0);
}

/** A count typed into a form: a finite number, zero or more, else null. */
export function parseAmount(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export type PantryItemDraft = { name: string; qty: string; unit: string; par: string };

/**
 * What's wrong with a pantry item form, per field; empty when it can be
 * saved. Units fall back to "pcs", so a blank one isn't an error.
 */
export function pantryItemErrors(
  draft: PantryItemDraft,
): Partial<Record<"name" | "qty" | "par", string>> {
  const errors: Partial<Record<"name" | "qty" | "par", string>> = {};
  if (!draft.name.trim()) errors.name = "Give it a name.";
  if (parseAmount(draft.qty) === null) errors.qty = "A number, 0 or more.";
  if (parseAmount(draft.par) === null) errors.par = "A number, 0 or more.";
  return errors;
}
