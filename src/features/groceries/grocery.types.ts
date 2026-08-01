import type { Task } from "@/features/tasks/task.types";

export type GroceryItem = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  pantryItemId?: string; // set when it was auto-suggested from pantry
  bought: boolean;
  costPHP?: number; // actual cost entered when bought
};

// Shared with the Palengke task cards on both the manager and helper side.
export type GroceryContextValue = {
  display: GroceryItem[]; // merged: state + auto-suggestions
  toBuyCount: number;
  budget: number;
  spent: number;
  remaining: number;
  receiptPhoto: string | null;
  addManual: (name: string, qty: number, unit: string) => void;
  toggleBought: (item: GroceryItem) => void;
  setCost: (item: GroceryItem, cost: number | undefined) => void;
  setBudget: (n: number) => void;
  attachReceipt: () => void;
  clearReceipt: () => void;
  remove: (item: GroceryItem) => void;
  isPalengkeTask: (t: Task) => boolean;
  openModal: () => void;
};
