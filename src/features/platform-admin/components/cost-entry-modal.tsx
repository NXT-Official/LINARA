import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";

import { saveCostEntryFn } from "../analytics.actions";
import {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  type CostCategory,
  type CostEntry,
} from "../analytics.types";
import { pesosToCentavos } from "../analytics.utils";

const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground";

type Errors = { month?: string; label?: string; amount?: string };

/** Add or edit one month's cost. The amount is typed in pesos and stored as centavos. */
export function CostEntryModal({
  token,
  entry,
  onClose,
  onSaved,
}: {
  token: string;
  entry: CostEntry | null;
  onClose: () => void;
  onSaved: (saved: CostEntry) => void;
}) {
  const [month, setMonth] = useState(entry ? entry.month.slice(0, 7) : "");
  const [category, setCategory] = useState<CostCategory>(entry?.category ?? COST_CATEGORIES[0]);
  const [label, setLabel] = useState(entry?.label ?? "");
  const [amount, setAmount] = useState(entry ? String(entry.amountCentavos / 100) : "");
  const [note, setNote] = useState(entry?.note ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const centavos = pesosToCentavos(amount);
    const next: Errors = {};
    if (!month) next.month = "Pick a month.";
    if (!label.trim()) next.label = "Add a label.";
    if (centavos === null) next.amount = "Enter an amount like 1200 or 1200.50.";
    setErrors(next);
    if (Object.keys(next).length > 0 || centavos === null) return;

    setSaving(true);
    try {
      const res = await saveCostEntryFn({
        data: {
          token,
          entry: {
            id: entry?.id,
            month: `${month}-01`,
            category,
            label: label.trim(),
            amountCentavos: centavos,
            note: note.trim() === "" ? null : note.trim(),
          },
        },
      });
      if (!res.available || !res.entry) {
        toast.error("Costs aren't switched on yet.");
        return;
      }
      toast.success("Cost saved.");
      onSaved(res.entry);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the cost.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4 p-5">
        <h2 className="font-display text-xl text-foreground">{entry ? "Edit cost" : "Add cost"}</h2>
        <Field label="Month" error={errors.month}>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-invalid={errors.month !== undefined}
            className={inputCls}
          />
        </Field>
        <Field label="Category">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as CostCategory)}
            className={inputCls}
          >
            {COST_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {COST_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Label" error={errors.label}>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            aria-invalid={errors.label !== undefined}
            className={inputCls}
          />
        </Field>
        <Field label="Amount (₱)" error={errors.amount}>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={errors.amount !== undefined}
            className={inputCls}
          />
        </Field>
        <Field label="Note">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save cost"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
