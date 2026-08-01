import { AlertCircle, Check, Package, Plus } from "lucide-react";
import { useState } from "react";

import type { PantryStore } from "../hooks/use-pantry";
import { PANTRY_CATEGORIES } from "../pantry.types";
import { AddPantryItemModal } from "./add-pantry-item-modal";
import { PantryRow } from "./pantry-row";

/** Stock levels grouped by category, lows first. Shown to managers and the Cook alike. */
export function PantrySection({ pantry }: { pantry: PantryStore }) {
  const { items, adjust: onAdjust, setQty: onSetQty, add: onAdd, remove: onRemove } = pantry;
  const [adding, setAdding] = useState(false);
  const lowCount = items.filter((i) => i.qty <= i.par).length;
  const grouped = PANTRY_CATEGORIES.map((cat) => ({
    cat,
    items: items
      .filter((i) => i.category === cat)
      .sort((a, b) => (a.qty <= a.par ? -1 : 1) - (b.qty <= b.par ? -1 : 1)),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep">
              <Package className="h-4 w-4" />
            </div>
            <h2 className="font-display text-xl text-foreground">Pantry</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Shared with the Cook. Keep supplies at or above par.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {lowCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft px-2.5 py-1 text-[11px] font-semibold text-[oklch(0.42_0.12_50)]">
              <AlertCircle className="h-3 w-3" /> {lowCount} running low
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep">
              <Check className="h-3 w-3" /> All stocked
            </span>
          )}
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-soft transition hover:bg-primary/5"
          >
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {grouped.map((g) => (
          <div key={g.cat}>
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {g.cat}
            </div>
            <div className="space-y-2">
              {g.items.map((i) => (
                <PantryRow
                  key={i.id}
                  item={i}
                  onAdjust={onAdjust}
                  onSetQty={onSetQty}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <AddPantryItemModal
          onClose={() => setAdding(false)}
          onAdd={(item) => {
            onAdd(item);
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}
