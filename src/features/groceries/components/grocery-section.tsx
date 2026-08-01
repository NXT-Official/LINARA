import { Plus, ShoppingBasket } from "lucide-react";
import { useEffect, useState } from "react";

import { useGrocery } from "../grocery-context";
import { BudgetBar } from "./budget-bar";
import { GroceryRow } from "./grocery-row";
import { ReceiptSlot } from "./receipt-slot";

export function GrocerySection() {
  const ctx = useGrocery();
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [budgetDraft, setBudgetDraft] = useState(String(ctx.budget));
  const budget = ctx.budget;
  useEffect(() => {
    setBudgetDraft(String(budget));
  }, [budget]);
  const toBuy = ctx.display.filter((g) => !g.bought);
  const bought = ctx.display.filter((g) => g.bought);
  const submit = () => {
    if (!name.trim()) return;
    const n = parseFloat(qty);
    ctx.addManual(name, isNaN(n) ? 1 : n, unit);
    setName("");
    setQty("1");
    setUnit("pcs");
  };
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-terracotta-soft text-[oklch(0.4_0.13_55)]">
              <ShoppingBasket className="h-4 w-4" />
            </div>
            <h2 className="font-display text-xl text-foreground">Grocery list</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Auto-suggested from Pantry lows. Attached to the Palengke run.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep">
          {toBuy.length} to buy
        </span>
      </div>

      {/* Petty cash / budget */}
      <div className="mt-4 rounded-2xl bg-background/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Petty cash budget
          </div>
          <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            ₱
            <input
              value={budgetDraft}
              onChange={(e) => setBudgetDraft(e.target.value)}
              onBlur={() => {
                const n = parseFloat(budgetDraft);
                if (!isNaN(n)) ctx.setBudget(n);
                else setBudgetDraft(String(ctx.budget));
              }}
              inputMode="numeric"
              className="w-20 rounded-lg border border-input bg-card px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary"
            />
          </label>
        </div>
        <BudgetBar compact />
      </div>

      <div className="mt-4 space-y-2">
        {toBuy.length === 0 && bought.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-background/60 p-4 text-center text-xs text-muted-foreground">
            Pantry is stocked — nothing suggested. Add manual items below.
          </div>
        )}
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

      {bought.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Bought · {bought.length}
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
        </div>
      )}

      {/* Receipt */}
      <div className="mt-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Receipt
        </div>
        <ReceiptSlot />
      </div>

      {/* Add manual */}
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl bg-background/60 p-3">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Add item
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="e.g. ulam for Sunday"
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="w-16">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Qty
          </span>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-xl border border-input bg-card px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
          />
        </label>
        <label className="w-20">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Unit
          </span>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded-xl border border-input bg-card px-2 py-2 text-center text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          onClick={submit}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </section>
  );
}
