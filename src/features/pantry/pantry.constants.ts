import type { PantryItem } from "./pantry.types";

export const INITIAL_PANTRY: PantryItem[] = [
  { id: "p1", name: "Rice", qty: 2, unit: "kg", par: 5, category: "Rice & grains" },
  { id: "p2", name: "Sofia's cereal", qty: 1, unit: "box", par: 2, category: "Rice & grains" },
  { id: "p3", name: "Baby formula", qty: 1, unit: "tin", par: 2, category: "Baby" },
  { id: "p4", name: "Diapers (M)", qty: 3, unit: "pack", par: 2, category: "Baby" },
  { id: "p5", name: "Cooking oil", qty: 1, unit: "L", par: 1, category: "Pantry" },
  { id: "p6", name: "Coffee", qty: 2, unit: "pack", par: 1, category: "Pantry" },
  { id: "p7", name: "Eggs", qty: 4, unit: "pcs", par: 12, category: "Fresh" },
  { id: "p8", name: "Garlic", qty: 3, unit: "bulb", par: 2, category: "Fresh" },
  { id: "p9", name: "Onion", qty: 4, unit: "pcs", par: 3, category: "Fresh" },
  { id: "p10", name: "Dish soap", qty: 2, unit: "bottle", par: 1, category: "Cleaning" },
  { id: "p11", name: "Detergent", qty: 1, unit: "pack", par: 1, category: "Cleaning" },
];
