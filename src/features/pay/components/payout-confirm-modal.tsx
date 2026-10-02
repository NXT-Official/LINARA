import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { useState } from "react";

import { Modal } from "@/components/shared/modal";
import { fmtPeso } from "@/features/groceries/grocery.utils";

import type { PayoutChannelCode, Payslip } from "../pay.types";

const CHANNEL_LABEL: Record<PayoutChannelCode, string> = {
  PH_GCASH: "GCash",
  PH_PAYMAYA: "Maya",
};

type Phase =
  | { kind: "confirm" }
  | { kind: "sending" }
  | { kind: "done"; status: Payslip["payoutStatus"] }
  | { kind: "failed"; message: string };

/**
 * The step between "Pay via GCash" and real money moving (QA, 2026-10-02:
 * one click called Xendit straight away, and nothing said what happened).
 * Shows who, which number, which channel and roughly how much, then stays
 * open with the outcome until the manager closes it. No retry from here: a
 * payout that errored may still have reached Xendit, and the payslip row's
 * own status (and "Check with Xendit") is the safe way to find out.
 */
export function PayoutConfirmModal({
  helperName,
  phone,
  channel,
  periodLabel,
  estimate,
  onClose,
  onConfirm,
}: {
  helperName: string;
  /** Her number on file; the payout goes to this wallet. */
  phone: string;
  channel: PayoutChannelCode;
  /** "Oct 1 – Oct 15", or "13th-month pay 2026". */
  periodLabel: string;
  /** What Linara works out it will send, when known. */
  estimate?: number;
  onClose: () => void;
  onConfirm: () => Promise<{ status: Payslip["payoutStatus"] }>;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "confirm" });
  const via = CHANNEL_LABEL[channel];
  const busy = phase.kind === "sending";

  const send = async () => {
    setPhase({ kind: "sending" });
    try {
      const result = await onConfirm();
      setPhase({ kind: "done", status: result.status });
    } catch (err) {
      setPhase({
        kind: "failed",
        message: err instanceof Error ? err.message : "The payout didn't go through.",
      });
    }
  };

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal onClose={close}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl text-foreground">
          {phase.kind === "done" || phase.kind === "failed"
            ? `Payout to ${helperName}`
            : `Send ${helperName}'s pay via ${via}?`}
        </h3>
        <button
          onClick={close}
          disabled={busy}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="mt-4 divide-y divide-border/70 text-sm">
        {[
          ["To", helperName],
          ["Number", phone || "None on file"],
          ["Through", via],
          ["For", periodLabel],
          ["Amount", estimate !== undefined ? `About ${fmtPeso(estimate)}` : "Worked out on send"],
        ].map(([term, value]) => (
          <div key={term} className="flex items-baseline justify-between gap-4 py-2">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="text-right font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>

      {phase.kind === "confirm" && (
        <p className="mt-3 text-xs text-muted-foreground">
          This sends real money through Xendit and can&apos;t be undone here. The exact amount is
          worked out when it sends, after any approved vale.
        </p>
      )}

      {phase.kind === "done" && phase.status !== "needs_review" && (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-2xl bg-primary/10 px-3 py-2.5 text-sm text-foreground"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          {phase.status === "succeeded"
            ? `Sent. ${via} confirmed it.`
            : `Sent to Xendit. ${via} usually confirms within a few minutes; the payslip below shows when it lands.`}
        </p>
      )}
      {phase.kind === "done" && phase.status === "needs_review" && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          Xendit couldn&apos;t confirm it, so it&apos;s held for review. Check Xendit before trying
          again.
        </p>
      )}
      {phase.kind === "failed" && (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {phase.message}
        </p>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        {phase.kind === "confirm" || phase.kind === "sending" ? (
          <>
            <button
              onClick={close}
              disabled={busy}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              onClick={send}
              disabled={busy || !phone}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-60"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {busy
                ? "Sending…"
                : estimate !== undefined
                  ? `Send ${fmtPeso(estimate)}`
                  : `Send via ${via}`}
            </button>
          </>
        ) : (
          <button
            onClick={onClose}
            className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
          >
            Done
          </button>
        )}
      </div>
    </Modal>
  );
}
