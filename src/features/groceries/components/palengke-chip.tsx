import { ShoppingBasket } from "lucide-react";

import { useGrocery } from "../grocery-context";
import { fmtPeso } from "../grocery.utils";

export function PalengkeChip({ compact }: { compact?: boolean } = {}) {
  const ctx = useGrocery();
  return (
    <button
      onClick={ctx.openModal}
      className={`inline-flex items-center gap-1 rounded-full border border-terracotta/50 bg-terracotta-soft/60 font-semibold text-[oklch(0.4_0.13_55)] transition hover:bg-terracotta-soft ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10px]"
      }`}
      title="Grocery list attached"
    >
      <ShoppingBasket className="h-2.5 w-2.5" />
      Grocery · {ctx.toBuyCount} to buy · {fmtPeso(ctx.spent)}
    </button>
  );
}
