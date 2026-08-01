import { ShoppingBasket } from "lucide-react";

import { useGrocery } from "../grocery-context";
import { BudgetBar } from "./budget-bar";
import { GroceryRow } from "./grocery-row";
import { ReceiptSlot } from "./receipt-slot";

export function PalengkeInlineList() {
  const ctx = useGrocery();
  const toBuy = ctx.display.filter((g) => !g.bought);
  const bought = ctx.display.filter((g) => g.bought);
  return (
    <div className="rounded-2xl border border-terracotta/40 bg-terracotta-soft/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-card text-[oklch(0.4_0.13_55)]">
            <ShoppingBasket className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-pine-deep">Your list · your budget</div>
            <div className="text-[11px] text-muted-foreground">
              {toBuy.length} to buy · {bought.length} bought
            </div>
          </div>
        </div>
        <button
          onClick={ctx.openModal}
          className="rounded-full border border-primary/30 bg-card px-3 py-1 text-[11px] font-semibold text-primary shadow-soft hover:bg-primary/5"
        >
          Open list
        </button>
      </div>

      <div className="mt-3 rounded-2xl bg-card/70 p-3">
        <BudgetBar compact />
      </div>

      {ctx.display.length === 0 ? (
        <p className="mt-3 text-xs italic text-muted-foreground">
          Nothing to buy — pantry is stocked.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {ctx.display.slice(0, 5).map((g) => (
            <li key={g.id}>
              <GroceryRow
                item={g}
                onToggle={() => ctx.toggleBought(g)}
                onRemove={() => ctx.remove(g)}
                onCost={(c) => ctx.setCost(g, c)}
                tone="light"
              />
            </li>
          ))}
          {ctx.display.length > 5 && (
            <li className="pt-1 text-center text-[11px] text-muted-foreground">
              +{ctx.display.length - 5} more · tap Open list
            </li>
          )}
        </ul>
      )}

      <div className="mt-3">
        <ReceiptSlot compact />
      </div>
    </div>
  );
}
