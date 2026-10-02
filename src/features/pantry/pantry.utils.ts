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

/** Out at zero, low at or under the buy-more point, otherwise fine. */
export function stockState(item: Pick<PantryItem, "qty" | "par">): StockState {
  if (item.qty <= 0) return "out";
  return item.qty <= item.par ? "low" : "ok";
}

export const STOCK_LABEL: Record<Exclude<StockState, "ok">, string> = {
  out: "Ubos",
  low: "Paubos",
};

// Plural units the starter list uses, and anyone typing "packs" by hand.
const PLURAL_UNITS = new Set(["packs", "bottles", "cans", "bars", "rolls", "heads", "boxes"]);

/** "1 pack", "2 packs": drops a plural unit's "s" at exactly one. Other units as typed. */
export function unitFor(n: number, unit: string): string {
  if (n !== 1 || !PLURAL_UNITS.has(unit.toLowerCase())) return unit;
  return unit.toLowerCase() === "boxes" ? unit.slice(0, -2) : unit.slice(0, -1);
}

/** The starter list's shelves: baby things last, since most homes untick them. */
export const STARTER_ORDER: PantryCategory[] = [
  "Rice & grains",
  "Fresh",
  "Pantry",
  "Cleaning",
  "Baby",
];

export type StarterItem = Omit<PantryItem, "id"> & {
  /** Ticked when the list first opens; baby things only if the home needs them. */
  picked: boolean;
};

/**
 * What a Filipino home usually keeps, for a household whose pantry is still
 * empty (client feedback, 2026-10-02: an empty Pantry gave them nothing to
 * do). They start stocked at twice the buy-more point, and anything already
 * running out is one tap away. ../LINARA_MOBILE/lib/pantry.ts carries the
 * same list for the app.
 */
export const STARTER_ITEMS: StarterItem[] = [
  { name: "Bigas", qty: 10, unit: "kg", par: 5, category: "Rice & grains", picked: true },
  { name: "Itlog", qty: 12, unit: "pcs", par: 6, category: "Fresh", picked: true },
  { name: "Bawang", qty: 4, unit: "heads", par: 2, category: "Fresh", picked: true },
  { name: "Sibuyas", qty: 6, unit: "pcs", par: 3, category: "Fresh", picked: true },
  { name: "Mantika", qty: 2, unit: "L", par: 1, category: "Pantry", picked: true },
  { name: "Toyo", qty: 2, unit: "bottles", par: 1, category: "Pantry", picked: true },
  { name: "Suka", qty: 2, unit: "bottles", par: 1, category: "Pantry", picked: true },
  { name: "Patis", qty: 2, unit: "bottles", par: 1, category: "Pantry", picked: true },
  { name: "Asin", qty: 2, unit: "packs", par: 1, category: "Pantry", picked: true },
  { name: "Asukal", qty: 2, unit: "kg", par: 1, category: "Pantry", picked: true },
  { name: "Kape", qty: 2, unit: "packs", par: 1, category: "Pantry", picked: true },
  { name: "Sabon panlaba", qty: 2, unit: "packs", par: 1, category: "Cleaning", picked: true },
  {
    name: "Dishwashing liquid",
    qty: 2,
    unit: "bottles",
    par: 1,
    category: "Cleaning",
    picked: true,
  },
  { name: "Toilet paper", qty: 8, unit: "rolls", par: 4, category: "Cleaning", picked: true },
  { name: "Sabong pampaligo", qty: 4, unit: "bars", par: 2, category: "Cleaning", picked: true },
  { name: "Bleach", qty: 2, unit: "bottles", par: 1, category: "Cleaning", picked: false },
  { name: "Diaper", qty: 20, unit: "pcs", par: 10, category: "Baby", picked: false },
  { name: "Gatas ng baby", qty: 2, unit: "cans", par: 1, category: "Baby", picked: false },
  { name: "Baby wipes", qty: 2, unit: "packs", par: 1, category: "Baby", picked: false },
];

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
