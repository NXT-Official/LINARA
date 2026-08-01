import type { ReactNode } from "react";

import type { PantryStore } from "@/features/pantry/hooks/use-pantry";

import { GroceryContext } from "../grocery-context";
import { useGroceryList } from "../hooks/use-grocery-list";
import { GroceryModal } from "./grocery-modal";

/**
 * Shares the grocery list between the manager's Pantry tab, the helper's Pantry
 * tab, and the Palengke task cards on both sides. Owns the "Palengke run" modal
 * so any card can open it without threading state back up.
 */
export function GroceryProvider({
  pantry,
  children,
}: {
  pantry: PantryStore;
  children: ReactNode;
}) {
  const { value, modalOpen, closeModal } = useGroceryList(pantry);
  return (
    <GroceryContext.Provider value={value}>
      {children}
      {modalOpen && <GroceryModal onClose={closeModal} />}
    </GroceryContext.Provider>
  );
}
