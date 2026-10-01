import { AlertCircle, Loader2, X } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";
import { fmtPeso } from "@/features/groceries/grocery.utils";
import { householdNow, toISODate } from "@/lib/time";

import type { OffAppMethod } from "../pay.types";

const METHODS: { value: OffAppMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "OTHER", label: "Other" },
];

/**
 * Records a payment the household made outside Linara, so the period is
 * settled on the record either way. She is asked in her app whether it
 * arrived; until she confirms, it can be withdrawn from the payslip list.
 */
export function RecordPaymentModal({
  helperName,
  periodLabel,
  estimate,
  onClose,
  onSubmit,
}: {
  helperName: string;
  /** "Aug 16 – Aug 31", or "13th-month pay 2026". */
  periodLabel: string;
  /** What Linara works out she's owed for it. */
  estimate: number;
  onClose: () => void;
  onSubmit: (payment: { method: OffAppMethod; paidOn: string; note?: string }) => Promise<void>;
}) {
  const today = toISODate(householdNow());
  const [method, setMethod] = useState<OffAppMethod>("CASH");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ method, paidOn, note: note.trim() || undefined });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't record the payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl text-foreground">Paid outside Linara</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {periodLabel} ·{" "}
            <span className="font-semibold text-foreground">{fmtPeso(estimate)}</span> for{" "}
            {helperName}. It goes on both your records, and {helperName} is asked in her app to
            confirm she received it.
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <fieldset>
          <legend className="mb-1.5 block text-xs font-semibold text-muted-foreground">
            How it was paid
          </legend>
          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <label
                key={m.value}
                className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  method === m.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/50"
                }`}
              >
                <input
                  type="radio"
                  name="method"
                  value={m.value}
                  checked={method === m.value}
                  onChange={() => setMethod(m.value)}
                  className="sr-only"
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Date paid">
          <input
            type="date"
            value={paidOn}
            max={today}
            onChange={(e) => e.target.value && setPaidOn(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Note (optional)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            placeholder="e.g. handed over in an envelope, with receipt"
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        {error && (
          <p className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
          </p>
        )}
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          disabled={submitting}
          className="rounded-lg px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Recording…
            </>
          ) : (
            "Record payment"
          )}
        </button>
      </div>
    </Modal>
  );
}
