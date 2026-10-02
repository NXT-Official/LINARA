import { X } from "lucide-react";
import { useState } from "react";

import { PANTRY_CATEGORIES, type PantryCategory, type PantryItem } from "../pantry.types";
import { CATEGORY_LABEL } from "../pantry.utils";

import { Modal } from "@/components/shared/modal";

/**
 * Add a pantry item, or edit one (`initial`). Editing leaves the stock
 * count alone: that's the row's − / + and its own number field.
 */
export function PantryItemModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: PantryItem;
  onClose: () => void;
  onSave: (item: Omit<PantryItem, "id">) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [qty, setQty] = useState(String(initial?.qty ?? 1));
  const [unit, setUnit] = useState(initial?.unit ?? "pcs");
  const [par, setPar] = useState(String(initial?.par ?? 1));
  const [category, setCategory] = useState<PantryCategory>(initial?.category ?? "Pantry");
  const valid = name.trim().length > 0 && !isNaN(parseFloat(qty)) && !isNaN(parseFloat(par));

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between">
        <h3 className="font-display text-xl text-foreground">
          {initial ? `Edit ${initial.name}` : "Add pantry item"}
        </h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Toilet paper"
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className={`grid gap-2 ${initial ? "grid-cols-2" : "grid-cols-3"}`}>
          {!initial && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted-foreground">
                On hand
              </span>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm tabular-nums outline-none focus:border-primary"
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Unit</span>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pcs, kg, L"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              Buy more at
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
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PantryCategory)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            {PANTRY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          disabled={!valid}
          onClick={() =>
            onSave({
              name: name.trim(),
              qty: parseFloat(qty),
              unit: unit.trim() || "pcs",
              par: parseFloat(par),
              category,
            })
          }
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
        >
          {initial ? "Save" : "Add"}
        </button>
      </div>
    </Modal>
  );
}
