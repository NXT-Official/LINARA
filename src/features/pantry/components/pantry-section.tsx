import { AlertCircle, Check, Package, Plus } from "lucide-react";
import { useState } from "react";

import { ListFilter } from "@/components/shared/list-filter";
import { FILTER_FROM, matchesQuery } from "@/components/shared/list-filter.utils";

import type { PantryStore } from "../hooks/use-pantry";
import { PANTRY_CATEGORIES, type PantryCategory, type PantryItem } from "../pantry.types";
import { CATEGORY_LABEL, needsBuying } from "../pantry.utils";
import { PantryItemModal } from "./pantry-item-modal";
import { PantryRow } from "./pantry-row";
import { PantryStarter } from "./pantry-starter";

type PantryFilter = "all" | "low" | PantryCategory;

/**
 * Stock levels grouped by category, lows first, with search and a filter.
 * Shown to managers and the Cook alike. An empty pantry offers the usual
 * staples to start from instead of a blank card.
 */
export function PantrySection({ pantry }: { pantry: PantryStore }) {
  const {
    items,
    adjust: onAdjust,
    setQty: onSetQty,
    add: onAdd,
    addMany,
    edit: onEdit,
    remove: onRemove,
  } = pantry;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PantryFilter>("all");
  const lowCount = items.filter(needsBuying).length;
  // Below FILTER_FROM the controls are hidden, so a leftover search can't hide items.
  const showFilter = items.length >= FILTER_FROM;
  const activeQuery = showFilter ? query : "";
  // Only shelves that hold something: a chip that shows nothing is a dead end.
  const chips: { key: PantryFilter; label: string }[] = [
    { key: "all", label: "All" },
    ...(lowCount > 0 ? [{ key: "low" as const, label: "Running low" }] : []),
    ...PANTRY_CATEGORIES.filter((c) => items.some((i) => i.category === c)).map((c) => ({
      key: c,
      label: CATEGORY_LABEL[c],
    })),
  ];
  // A chip that went away (the last low item restocked) stops filtering.
  const activeFilter = showFilter && chips.some((c) => c.key === filter) ? filter : "all";
  const shown = items.filter(
    (i) =>
      matchesQuery(i.name, activeQuery) &&
      (activeFilter === "all" ||
        (activeFilter === "low" ? needsBuying(i) : i.category === activeFilter)),
  );
  const grouped = PANTRY_CATEGORIES.map((cat) => ({
    cat,
    items: shown
      .filter((i) => i.category === cat)
      .sort((a, b) => (needsBuying(a) ? -1 : 1) - (needsBuying(b) ? -1 : 1)),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep">
              <Package className="h-4 w-4" />
            </div>
            <h2 className="font-display text-xl text-foreground">Pantry</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Shared with your staff. What runs low goes on the grocery list.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {items.length === 0 ? null : lowCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft px-2.5 py-1 text-xs font-semibold text-accent-foreground">
              <AlertCircle className="h-3 w-3" /> {lowCount} running low
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-pine-deep">
              <Check className="h-3 w-3" /> All stocked
            </span>
          )}
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-soft transition hover:bg-primary/5"
          >
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
        </div>
      </div>

      {showFilter && (
        <div className="mt-4">
          <ListFilter
            query={query}
            onQuery={setQuery}
            chips={chips}
            active={activeFilter}
            onChip={setFilter}
            label="Search pantry"
          />
        </div>
      )}

      <div className="mt-4 space-y-4">
        {items.length === 0 && <PantryStarter onAdd={addMany} onAddOwn={() => setAdding(true)} />}
        {items.length > 0 && grouped.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">Nothing matches.</p>
        )}
        {grouped.map((g) => (
          <div key={g.cat}>
            <div className="px-1 text-xs font-semibold text-muted-foreground">
              {CATEGORY_LABEL[g.cat]}
            </div>
            <div className="divide-y divide-border/60">
              {g.items.map((i) => (
                <PantryRow
                  key={i.id}
                  item={i}
                  onAdjust={onAdjust}
                  onSetQty={onSetQty}
                  onEdit={setEditing}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <PantryItemModal
          onClose={() => setAdding(false)}
          onSave={(item) => {
            onAdd(item);
            setAdding(false);
          }}
        />
      )}
      {editing && (
        <PantryItemModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={(item) => {
            onEdit(editing.id, {
              name: item.name,
              unit: item.unit,
              par: item.par,
              category: item.category,
            });
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
