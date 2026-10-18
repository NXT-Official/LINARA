import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Field } from "@/components/shared/field";
import { Modal } from "@/components/shared/modal";
import { fmtCentavos } from "@/features/billing/money";

import {
  markInvoicePaidFn,
  type HouseholdOverview,
  type PaymentChannel,
} from "../households.actions";

const INPUT =
  "w-full rounded-2xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";
const PRIMARY =
  "inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50";
const SECONDARY =
  "inline-flex items-center justify-center rounded-xl border border-primary/30 bg-card px-3.5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/5";

const CHANNELS: { value: PaymentChannel; label: string }[] = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "gcash", label: "GCash" },
  { value: "maya", label: "Maya" },
  { value: "cash", label: "Cash" },
  { value: "other", label: "Other" },
];

export function MarkPaidModal({
  household,
  token,
  onClose,
  onPaid,
}: {
  household: HouseholdOverview;
  token: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const invoice = household.pendingInvoice;
  const [channel, setChannel] = useState<PaymentChannel>("bank_transfer");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!invoice) return;
    setSaving(true);
    setError(null);
    try {
      const reply = await markInvoicePaidFn({
        data: { token, invoiceId: invoice.id, channel, note: note.trim() },
      });
      if (!reply.available) {
        setError("Admin tools aren't switched on yet.");
        return;
      }
      toast.success(
        reply.applied
          ? `Marked ${invoice.invoiceNumber} paid`
          : `${invoice.invoiceNumber} was already paid or expired, so nothing changed`,
      );
      onPaid();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't mark the invoice paid");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-xl text-foreground">Mark invoice paid</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {invoice && (
        <p className="mt-2 text-sm text-muted-foreground">
          {household.name} · {invoice.invoiceNumber} · {fmtCentavos(invoice.amountCentavos)}
        </p>
      )}
      <div className="mt-4 space-y-3">
        <Field label="Channel">
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as PaymentChannel)}
            className={INPUT}
          >
            {CHANNELS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Note">
          <textarea
            value={note}
            maxLength={500}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            className={INPUT}
          />
        </Field>
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className={SECONDARY} onClick={onClose}>
          Cancel
        </button>
        <button className={PRIMARY} disabled={saving || !invoice} onClick={() => void confirm()}>
          {saving ? "Saving" : "Confirm payment"}
        </button>
      </div>
    </Modal>
  );
}
