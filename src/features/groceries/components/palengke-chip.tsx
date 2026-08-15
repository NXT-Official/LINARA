import { Link } from "@tanstack/react-router";
import { ShoppingBasket } from "lucide-react";

import { useGrocery } from "../grocery-context";
import { fmtPeso } from "../grocery.utils";

/** Grocery list glance + jump-off point. Links to the real Pantry page
 * instead of opening a modal -- there's no in-place execution to do here
 * anymore (see KNOWN_GAPS.md Closed Gap C13). */
export function PalengkeChip({ compact }: { compact?: boolean } = {}) {
  const ctx = useGrocery();
  return (
    <Link
      to="/manager/pantry"
      className={`inline-flex items-center gap-1 rounded-full border border-terracotta/50 bg-terracotta-soft/60 font-semibold text-[oklch(0.4_0.13_55)] transition hover:bg-terracotta-soft ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10px]"
      }`}
      title="Grocery list attached"
    >
      <ShoppingBasket className="h-2.5 w-2.5" />
      Grocery · {ctx.toBuyCount} to buy · {fmtPeso(ctx.spent)}
    </Link>
  );
}
