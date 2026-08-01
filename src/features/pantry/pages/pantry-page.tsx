import { useAppStores } from "@/features/dashboard/app-store-context";
import { GrocerySection } from "@/features/groceries/components/grocery-section";

import { PantrySection } from "../components/pantry-section";

/**
 * Stock levels and the shared grocery list — identical for managers and helpers.
 * `title` is the page's `<h1>`; the helper shell already renders one, so the
 * helper route leaves it off.
 */
export function PantryPage({ title }: { title?: string }) {
  const { pantry } = useAppStores();
  return (
    <div className="space-y-5">
      {title && <h1 className="sr-only">{title}</h1>}
      <PantrySection pantry={pantry} />
      <GrocerySection />
    </div>
  );
}
