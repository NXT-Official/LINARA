import { AlertCircle, Loader2, X } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/shared/field";

import { REGIONAL_MINIMUM_WAGE } from "../people.constants";
import { LegalContributionSplitCard } from "./legal-contribution-split-card";

/** Lets a manager change a helper's wage after invite -- previously
 * monthly_rate was write-once (only set at invite creation), see
 * KNOWN_GAPS.md's helper-wage-editing gap. */
export function EditWageModal({
  name,
  initialWagePHP,
  onClose,
  onSubmit,
}: {
  name: string;
  initialWagePHP: number;
  onClose: () => void;
  onSubmit: (wagePHP: number) => Promise<void>;
}) {
  const [wage, setWage] = useState(String(initialWagePHP));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(parseInt(wage, 10) || 0);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update the wage.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl text-foreground">Edit {name}'s wage</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Updates the household's record. Takes effect on the Pay Dial and next contribution
              split.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Monthly wage (₱)">
            <input
              inputMode="numeric"
              value={wage}
              onChange={(e) => setWage(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>

          {parseInt(wage, 10) < REGIONAL_MINIMUM_WAGE && (
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div>
                <span className="font-semibold block mb-0.5">
                  Batas Kasambahay Compliance Warning
                </span>
                Ang sweldong ₱{(parseInt(wage, 10) || 0).toLocaleString()} ay mababa sa regional
                minimum wage na{" "}
                <span className="font-semibold">₱{REGIONAL_MINIMUM_WAGE.toLocaleString()}</span>{" "}
                para sa mga kasambahay. Mangyaring ayusin ito upang makatugon sa batas.
              </div>
            </div>
          )}

          <LegalContributionSplitCard wagePHP={parseInt(wage, 10) || 0} />

          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-full px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
              </>
            ) : (
              "Save wage"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
