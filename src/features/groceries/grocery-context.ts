import { createContext, useContext } from "react";

import type { GroceryContextValue } from "./grocery.types";

export const GroceryContext = createContext<GroceryContextValue | undefined>(undefined);

export function useGrocery(): GroceryContextValue {
  const context = useContext(GroceryContext);
  if (!context) throw new Error("useGrocery must be used within GroceryProvider");
  return context;
}
