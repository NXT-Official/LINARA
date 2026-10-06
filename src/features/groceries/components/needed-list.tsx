import { Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { ListFilter } from "@/components/shared/list-filter";
import { matchesQuery } from "@/components/shared/list-filter.utils";
import { useAppStores } from "@/features/dashboard/app-store-context";
import { PANTRY_CATEGORIES } from "@/features/pantry/pantry.types";
import { groupByPantryCategory, parseAmount } from "@/features/pantry/pantry.utils";

import { useGrocery } from "../grocery-context";
import { GroceryRow } from "./grocery-row";
import { ReceiptSlot } from "./receipt-slot";

type GroceryFilter = "all" | "to_buy" | "bought";

/** Search and filter only earn their space once the list is longer than a glance. */
const FILTER_FROM = 9;

/**
 * The Needed pool: what's running low, "Ubos na" from staff, and anything
 * added by hand, grouped by the pantry shelf it restocks. Lines can still be
 * ticked bought straight from here; once runs exist, "Plan a run" takes
 * lines from here onto one. Before add-grocery-runs.sql this is the whole
 * list, as it always was.
 */
export function NeededList({ onPlanRun }: { onPlanRun?: () => void }) {
  const ctx = useGrocery();
  const { pantry } = useAppStores();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GroceryFilter>("all");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [addError, setAddError] = useState<string | null>(null);

  // Below FILTER_FROM the controls are hidden, so a leftover search can't hide lines.
  const showFilter = ctx.needed.length >= FILTER_FROM;
  const activeQuery = showFilter ? query : "";
  const activeFilter = showFilter ? filter : "all";
  const shown = ctx.needed.filter((g) => matchesQuery(g.name, activeQuery));
  const toBuy = activeFilter === "bought" ? [] : shown.filter((g) => !g.bought);
  const bought = activeFilter === "to_buy" ? [] : shown.filter((g) => g.bought);
  const filtering = activeQuery.trim() !== "" || activeFilter !== "all";
  const toBuyGroups = groupByPantryCategory(toBuy, pantry.items, PANTRY_CATEGORIES);
  const chips: { key: GroceryFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "to_buy", label: "To buy" },
    { key: "bought", label: ctx.runsAvailable ? "Bought today" : "Bought" },
  ];

  const submit = () => {
    const n = parseAmount(qty);
    if (!name.trim()) return setAddError("Type what to buy.");
    if (n === null || n === 0) return setAddError("Qty: a number above 0.");
    setAddError(null);
    ctx.addManual(name, n, unit);
    setName("");
    setQty("1");
    setUnit("pcs");
  };

  return (
    <div>
      {onPlanRun && ctx.toBuyCount > 0 && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={onPlanRun}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep sm:w-auto sm:py-2"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> Plan a run
          </button>
        </div>
      )}

      {showFilter && (
        <ListFilter
          query={query}
          onQuery={setQuery}
          chips={chips}
          active={filter}
          onChip={setFilter}
          label="Search grocery list"
        />
      )}

      <div className="mt-2 space-y-3">
        {toBuy.length === 0 && bought.length === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {filtering
              ? "Nothing matches."
              : pantry.items.length === 0
                ? "Set up the pantry above, and anything running low will show up here."
                : "Nothing is running low. Add anything else you need below."}
          </div>
        )}
        {toBuyGroups.map(({ section, items }) => (
          <div key={section.key}>
            {/* One heading is noise; sections only help once there are two. */}
            {toBuyGroups.length > 1 && (
              <div className="px-1 pt-1 text-xs font-semibold text-muted-foreground">
                {section.label}
              </div>
            )}
            <div className="divide-y divide-border/70">
              {items.map((g) => (
                <GroceryRow
                  key={g.id}
                  item={g}
                  onRemove={() => ctx.remove(g)}
                  onEdit={(patch) => ctx.edit(g, patch)}
                  onAddSuggestion={() => ctx.addSuggestion(g)}
                  onToggleBought={() => ctx.toggleBought(g)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {bought.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 px-1 text-xs font-semibold text-muted-foreground">
            {ctx.runsAvailable ? "Bought today" : "Bought"} · {bought.length}
          </div>
          <div className="divide-y divide-border/70">
            {bought.map((g) => (
              <GroceryRow
                key={g.id}
                item={g}
                onToggleBought={() => ctx.toggleBought(g)}
                onCost={ctx.runsAvailable ? (cost) => ctx.setCost(g, cost) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">Receipts</div>
        <ReceiptSlot />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border/60 pt-4">
        <label className="min-w-0 basis-full sm:basis-auto sm:flex-1">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Add item</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="e.g. bangus"
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="w-16">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Qty</span>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-xl border border-input bg-background px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
          />
        </label>
        <label className="w-20">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Unit</span>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-2 py-2 text-center text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          onClick={submit}
          className="inline-flex items-center gap-1 rounded-lg bg-card px-3.5 py-2 text-xs font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/5"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
        {addError && (
          <p role="alert" className="basis-full text-xs font-semibold text-destructive">
            {addError}
          </p>
        )}
      </div>
    </div>
  );
}
