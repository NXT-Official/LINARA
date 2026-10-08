import { AlertCircle, Loader2, X } from "lucide-react";
import { useState } from "react";

import { Modal } from "@/components/shared/modal";
import { Field } from "@/components/shared/field";
import type { PayPeriod } from "@/features/pay/pay.types";
import { formatCutoffDay, formatCutoffRange } from "@/features/pay/pay.utils";

import { REGIONAL_MINIMUM_WAGE } from "../people.constants";
import { LegalContributionSplitCard } from "./legal-contribution-split-card";

const dayAfter = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Lets a manager change a helper's wage after invite -- previously
 * monthly_rate was write-once (only set at invite creation), see
 * KNOWN_GAPS.md's helper-wage-editing gap. A new wage starts at the cutoff
 * open now or the next one; closed periods keep the wage they had, paid or
 * not (add-wage-history.sql, KNOWN_GAPS O50). */
export function EditWageModal({
  name,
  initialWagePHP,
  currentPeriod,
  onClose,
  onSubmit,
}: {
  name: string;
  initialWagePHP: number;
  /** The cutoff open now; none for an invite not yet claimed. */
  currentPeriod?: PayPeriod;
  onClose: () => void;
  onSubmit: (wagePHP: number, effectiveFrom?: string) => Promise<void>;
}) {
  const [wage, setWage] = useState(String(initialWagePHP));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thisPaid = Boolean(currentPeriod?.payslipId);
  const nextStart = currentPeriod ? dayAfter(currentPeriod.fullEnd) : null;
  const [startsNext, setStartsNext] = useState(thisPaid);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const effectiveFrom = currentPeriod
        ? startsNext && nextStart
          ? nextStart
          : currentPeriod.fullStart
        : undefined;
      await onSubmit(parseInt(wage, 10) || 0, effectiveFrom);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update the wage.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl text-foreground">Edit {name}'s wage</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Pay periods that already closed keep the wage they had, paid or not.
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

        {currentPeriod && nextStart && (
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-muted-foreground">
              Starts from
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <WhenOption
                checked={!startsNext}
                disabled={thisPaid}
                onSelect={() => setStartsNext(false)}
                title="This cutoff"
                body={
                  thisPaid
                    ? "Already paid"
                    : formatCutoffRange(currentPeriod.fullStart, currentPeriod.fullEnd)
                }
              />
              <WhenOption
                checked={startsNext}
                onSelect={() => setStartsNext(true)}
                title="Next cutoff"
                body={`From ${formatCutoffDay(nextStart)}`}
              />
            </div>
          </fieldset>
        )}

        {parseInt(wage, 10) < REGIONAL_MINIMUM_WAGE && (
          <div className="rounded-2xl bg-status-late-soft/60 border border-status-late/30 p-3.5 text-xs text-status-late-ink flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-status-late-ink mt-0.5" />
            <div>
              <span className="font-semibold block mb-0.5">
                Batas Kasambahay Compliance Warning
              </span>
              Ang sweldong ₱{(parseInt(wage, 10) || 0).toLocaleString()} ay mababa sa regional
              minimum wage na{" "}
              <span className="font-semibold">₱{REGIONAL_MINIMUM_WAGE.toLocaleString()}</span> para
              sa mga kasambahay. Mangyaring ayusin ito upang makatugon sa batas.
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
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
            </>
          ) : (
            "Save wage"
          )}
        </button>
      </div>
    </Modal>
  );
}

function WhenOption({
  checked,
  disabled = false,
  onSelect,
  title,
  body,
}: {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
        checked ? "border-primary bg-primary/5" : "border-input bg-background"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-primary/60"}`}
    >
      <input
        type="radio"
        name="wage-starts"
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="mt-0.5 accent-[var(--pine)]"
      />
      <span>
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </label>
  );
}
