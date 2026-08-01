import { X } from "lucide-react";

import { useGrocery } from "../grocery-context";
import { BudgetBar } from "./budget-bar";
import { GroceryRow } from "./grocery-row";
import { ReceiptSlot } from "./receipt-slot";

export function GroceryModal({ onClose }: { onClose: () => void }) {
  const ctx = useGrocery();
  const toBuy = ctx.display.filter((g) => !g.bought);
  const bought = ctx.display.filter((g) => g.bought);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-lift">
        <div className="flex items-start justify-between border-b border-border/60 p-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Palengke run
            </div>
            <h3 className="mt-1 font-display text-xl text-foreground">Grocery & budget</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {toBuy.length} to buy · {bought.length} bought
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-4">
          <div className="rounded-2xl bg-background/60 p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Spent vs. budget
            </div>
            <BudgetBar compact />
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Receipt
            </div>
            <ReceiptSlot />
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              To buy
            </div>
            {toBuy.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                All checked off. Salamat!
              </div>
            ) : (
              <div className="space-y-1.5">
                {toBuy.map((g) => (
                  <GroceryRow
                    key={g.id}
                    item={g}
                    onToggle={() => ctx.toggleBought(g)}
                    onRemove={() => ctx.remove(g)}
                    onCost={(c) => ctx.setCost(g, c)}
                  />
                ))}
              </div>
            )}
          </div>
          {bought.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Bought
              </div>
              <div className="space-y-1.5">
                {bought.map((g) => (
                  <GroceryRow
                    key={g.id}
                    item={g}
                    onToggle={() => ctx.toggleBought(g)}
                    onRemove={() => ctx.remove(g)}
                    onCost={(c) => ctx.setCost(g, c)}
                  />
                ))}
              </div>
              <p className="mt-2 px-1 text-[11px] italic text-muted-foreground">
                Enter what each item actually cost. Checking off a suggested item also bumps the
                pantry back up.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
