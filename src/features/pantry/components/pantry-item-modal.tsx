import { X } from "lucide-react";
import { useState } from "react";

import { PANTRY_CATEGORIES, type PantryCategory, type PantryItem } from "../pantry.types";
import { CATEGORY_LABEL, pantryItemErrors, parseAmount } from "../pantry.utils";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";

const INPUT =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary aria-[invalid=true]:border-destructive";

/**
 * Add a pantry item, or edit one (`initial`). Editing leaves the stock
 * count alone: that's the row's − / + and its own number field. Save says
 * what's wrong, field by field, rather than staying greyed out (QA,
 * 2026-10-02).
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
  // Errors show once she's tried to save, and then follow her typing.
  const [tried, setTried] = useState(false);
  const errors = tried ? pantryItemErrors({ name, qty, unit, par }) : {};

  const save = () => {
    setTried(true);
    if (Object.keys(pantryItemErrors({ name, qty, unit, par })).length > 0) return;
    onSave({
      name: name.trim(),
      qty: parseAmount(qty) ?? 0,
      unit: unit.trim() || "pcs",
      par: parseAmount(par) ?? 0,
      category,
    });
  };

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
        <Field label="Name" error={errors.name}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Toilet paper"
            aria-invalid={!!errors.name}
            className={INPUT}
          />
        </Field>
        <div className={`grid gap-2 ${initial ? "grid-cols-2" : "grid-cols-3"}`}>
          {!initial && (
            <Field label="On hand" error={errors.qty}>
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                aria-invalid={!!errors.qty}
                className={`${INPUT} tabular-nums`}
              />
            </Field>
          )}
          <Field label="Unit">
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="pcs, kg, L"
              className={INPUT}
            />
          </Field>
          <Field label="Keep at least" error={errors.par}>
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={par}
              onChange={(e) => setPar(e.target.value)}
              aria-invalid={!!errors.par}
              className={`${INPUT} tabular-nums`}
            />
          </Field>
        </div>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PantryCategory)}
            className={INPUT}
          >
            {PANTRY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onClick={save}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
        >
          {initial ? "Save" : "Add"}
        </button>
      </div>
    </Modal>
  );
}
