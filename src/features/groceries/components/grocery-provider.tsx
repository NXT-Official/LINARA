import type { ReactNode } from "react";

import type { PantryStore } from "@/features/pantry/hooks/use-pantry";

import { GroceryContext } from "../grocery-context";
import { useGroceryList } from "../hooks/use-grocery-list";

/**
 * Shares the grocery list between the manager's Pantry tab and the Money
 * tab's spend dial. No modal to own anymore -- as of Closed Gap C13, shopping
 * execution (check off, cost, receipt) is LINARA_MOBILE-only; this app just
 * reads real state plus curates the planned list and budget.
 */
export function GroceryProvider({
  pantry,
  token,
  ready,
  receiptPhoto,
  children,
}: {
  pantry: PantryStore;
  token: string | null;
  ready: boolean;
  receiptPhoto: string | null;
  children: ReactNode;
}) {
  const value = useGroceryList({ pantry, token, ready, receiptPhoto });
  return <GroceryContext.Provider value={value}>{children}</GroceryContext.Provider>;
}
