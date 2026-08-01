import { X } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/shared/field";

export function ValeRequestModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (amount: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const amt = Number(amount);
  const valid = amt > 0 && reason.trim().length > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl text-foreground">Request cash advance</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Ma'am will see it in her "Needs you" list.
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
          <Field label="Amount (₱)">
            <div className="flex items-center rounded-xl border border-input bg-background px-3 py-2.5 focus-within:border-primary">
              <span className="mr-1 text-sm font-semibold text-muted-foreground">₱</span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="1000"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </Field>
          <Field label="Reason">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Tuition balance for my daughter"
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => valid && onSubmit(amt, reason.trim())}
            disabled={!valid}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
          >
            Send request
          </button>
        </div>
      </div>
    </div>
  );
}
