import { Plus, ShoppingBasket } from "lucide-react";
import { useEffect, useState } from "react";

import { ListFilter, matchesQuery } from "@/components/shared/list-filter";

import { useGrocery } from "../grocery-context";
import { BudgetBar } from "./budget-bar";
import { GroceryRow } from "./grocery-row";
import { ReceiptSlot } from "./receipt-slot";

type GroceryFilter = "all" | "to_buy" | "bought";
const FILTER_CHIPS: { key: GroceryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "to_buy", label: "To buy" },
  { key: "bought", label: "Bought" },
];

export function GrocerySection() {
  const ctx = useGrocery();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GroceryFilter>("all");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [budgetDraft, setBudgetDraft] = useState(String(ctx.budget));
  const budget = ctx.budget;
  useEffect(() => {
    setBudgetDraft(String(budget));
  }, [budget]);
  const toBuyCount = ctx.display.filter((g) => !g.bought).length;
  const shown = ctx.display.filter((g) => matchesQuery(g.name, query));
  const toBuy = filter === "bought" ? [] : shown.filter((g) => !g.bought);
  const bought = filter === "to_buy" ? [] : shown.filter((g) => g.bought);
  const filtering = query.trim() !== "" || filter !== "all";
  const submit = () => {
    if (!name.trim()) return;
    const n = parseFloat(qty);
    ctx.addManual(name, isNaN(n) ? 1 : n, unit);
    setName("");
    setQty("1");
    setUnit("pcs");
  };
  return (
    <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft sm:p-6">
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
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-pine-deep">
          {toBuyCount} to buy
        </span>
      </div>

      {/* Petty cash / budget */}
      <div className="mt-4 rounded-2xl bg-background/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold text-muted-foreground">Petty cash budget</div>
          <label className="inline-flex items-center gap-1 text-xs text-muted-foreground">
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

      {ctx.display.length > 0 && (
        <div className="mt-4">
          <ListFilter
            query={query}
            onQuery={setQuery}
            chips={FILTER_CHIPS}
            active={filter}
            onChip={setFilter}
            label="Search grocery list"
          />
        </div>
      )}

      <div className="mt-2 divide-y divide-border/70">
        {toBuy.length === 0 && bought.length === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {filtering
              ? "Nothing matches."
              : "Pantry is stocked — nothing suggested. Add manual items below."}
          </div>
        )}
        {toBuy.map((g) => (
          <GroceryRow
            key={g.id}
            item={g}
            onRemove={() => ctx.remove(g)}
            onEdit={(patch) => ctx.edit(g, patch)}
            onAddSuggestion={() => ctx.addSuggestion(g)}
          />
        ))}
      </div>

      {bought.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
            Bought · {bought.length}
          </div>
          <div className="divide-y divide-border/70">
            {bought.map((g) => (
              <GroceryRow key={g.id} item={g} />
            ))}
          </div>
        </div>
      )}

      {/* Receipt */}
      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">Receipt</div>
        <ReceiptSlot />
      </div>

      {/* Add manual */}
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl bg-background/60 p-3">
        <label className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Add item</span>
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
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Qty</span>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-xl border border-input bg-card px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
          />
        </label>
        <label className="w-20">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Unit</span>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded-xl border border-input bg-card px-2 py-2 text-center text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          onClick={submit}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </section>
  );
}
