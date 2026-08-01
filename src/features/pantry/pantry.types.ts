// Household stock levels. `par` is the minimum we want on hand before restocking.

export const PANTRY_CATEGORIES = ["Rice & grains", "Fresh", "Baby", "Cleaning", "Pantry"] as const;
export type PantryCategory = (typeof PANTRY_CATEGORIES)[number];
export type PantryItem = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  par: number;
  category: PantryCategory;
};
