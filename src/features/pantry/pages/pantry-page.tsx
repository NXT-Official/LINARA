import { useEffect } from "react";

import { useAppStores } from "@/features/dashboard/app-store-context";
import { GrocerySection } from "@/features/groceries/components/grocery-section";
import { useGrocery } from "@/features/groceries/grocery-context";

import { PantrySection } from "../components/pantry-section";

/**
 * Stock levels and the shared grocery list — identical for managers and helpers.
 * `title` is the page's `<h1>`; the helper shell already renders one, so the
 * helper route leaves it off.
 *
 * Neither table is in the realtime publication, so while this page is open
 * it re-reads both every 30 seconds to pick up what the helper changed.
 */
const POLL_MS = 30_000;

export function PantryPage({ title }: { title?: string }) {
  const { pantry } = useAppStores();
  const grocery = useGrocery();
  const refreshPantry = pantry.refresh;
  const refreshGrocery = grocery.refresh;
  useEffect(() => {
    const tick = () => {
      refreshPantry().catch((err) => console.error("[PantryPage] Pantry refresh failed:", err));
      refreshGrocery().catch((err) => console.error("[PantryPage] Grocery refresh failed:", err));
    };
    const timer = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshPantry, refreshGrocery]);
  return (
    <div className="space-y-5">
      {title && <h1 className="sr-only">{title}</h1>}
      <PantrySection pantry={pantry} />
      <GrocerySection />
    </div>
  );
}
