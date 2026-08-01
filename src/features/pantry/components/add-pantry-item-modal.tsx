import { X } from "lucide-react";
import { useState } from "react";

import { PANTRY_CATEGORIES, type PantryCategory, type PantryItem } from "../pantry.types";

export function AddPantryItemModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (item: Omit<PantryItem, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [par, setPar] = useState("1");
  const [category, setCategory] = useState<PantryCategory>("Pantry");
  const valid = name.trim().length > 0 && !isNaN(parseFloat(qty)) && !isNaN(parseFloat(par));

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between">
          <h3 className="font-display text-xl text-foreground">Add pantry item</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Toilet paper"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Qty
              </span>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm tabular-nums outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Unit
              </span>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pcs, kg, L"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Par
              </span>
              <input
                value={par}
                onChange={(e) => setPar(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm tabular-nums outline-none focus:border-primary"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Category
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PantryCategory)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {PANTRY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            disabled={!valid}
            onClick={() =>
              onAdd({
                name: name.trim(),
                qty: parseFloat(qty),
                unit: unit.trim() || "pcs",
                par: parseFloat(par),
                category,
              })
            }
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
