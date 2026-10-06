import { useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock,
  RefreshCw,
  Smartphone,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { fmtPeso } from "@/features/groceries/grocery.utils";
import type { Helper } from "@/features/people/people.types";

import type { HouseholdCutoff } from "../pay.actions";
import {
  METHOD_LABEL,
  type ManualPayment,
  type Payslip,
  type PayoutChannelCode,
} from "../pay.types";
import { formatAge, payoutStaleness } from "../payout-staleness";
import { formatCutoffRange } from "../pay.utils";
import { payslipCovering } from "../payslip-match";
import { XENDIT_PAYOUTS_ON } from "../payout-mode";
import { PayDirectModal } from "./pay-direct-modal";
import { PayoutConfirmModal } from "./payout-confirm-modal";
import { RecordPaymentModal } from "./record-payment-modal";

/** Where an outside-Linara payment stands with her. */
export function AckChip({ payslip }: { payslip: Payslip }) {
  if (payslip.payoutProvider !== "manual" || !payslip.helperAck) return null;
  const { label, tone } =
    payslip.helperAck === "confirmed"
      ? { label: "She confirmed", tone: "bg-primary/10 text-primary" }
      : payslip.helperAck === "disputed"
        ? { label: "She says not received", tone: "bg-destructive/10 text-destructive" }
        : { label: "Awaiting her confirmation", tone: "bg-accent/15 text-terracotta-ink" };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>;
}

const STATUS_LABEL: Record<Payslip["payoutStatus"], string> = {
  pending_send: "Sending…",
  processing: "Processing",
  succeeded: "Paid",
  failed: "Failed",
  needs_review: "Needs review",
};

function StatusBadge({ status }: { status: Payslip["payoutStatus"] }) {
  const Icon =
    status === "succeeded"
      ? CheckCircle2
      : status === "failed"
        ? XCircle
        : status === "needs_review"
          ? AlertTriangle
          : Clock;
  const tone =
    status === "succeeded"
      ? "text-status-done-ink bg-status-done-soft"
      : status === "failed"
        ? "text-destructive bg-destructive/10"
        : status === "needs_review"
          ? "text-status-late-ink bg-status-late-soft"
          : "text-terracotta-ink bg-accent/10";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}
    >
      <Icon className="h-3 w-3" /> {STATUS_LABEL[status]}
    </span>
  );
}

/**
 * The real "Pay Now" action + payslip history, replacing
 * architecture.md Section 5.3's "Future Phase 3" placeholder (KNOWN_GAPS.md
 * gap #9). Only shown for a real active helper -- payNow's channelCode
 * choice mirrors LegalContributionSplitCard's channel picker precedent
 * (GCash/Maya are the only two channels verified live against Xendit's
 * sandbox, see supabase/add-payslips-table.sql).
 */
export function PayslipHistory({
  helper,
  payslips,
  cutoff,
  label = "Current cutoff",
  estimate,
  onPayNow,
  onReconcile,
  onRecordOffApp,
  onWithdrawOffApp,
}: {
  helper: Helper | null;
  payslips: Payslip[];
  /**
   * The current cutoff, derived in Postgres and passed down -- never computed
   * here. `null` while it loads; the Pay buttons stay hidden until it arrives,
   * because without it we cannot tell whether this cutoff was already paid,
   * and showing "Pay via GCash" on a guess is exactly the bug Session B fixes.
   */
  cutoff: Pick<HouseholdCutoff, "cutoffStart" | "cutoffEnd"> | null;
  /** "Final pay" for a helper who has left; her cutoff ends on her last day. */
  label?: string;
  /** What the Pay buttons would send, when the caller knows it (final pay). */
  estimate?: number;
  onPayNow: (
    helperId: string,
    channelCode: PayoutChannelCode,
  ) => Promise<{ status: Payslip["payoutStatus"] }>;
  /** Asks Xendit what really happened to a stuck payout and writes the answer
   *  back. Offered only once `payoutStaleness` says the row has stopped
   *  moving -- see that module for why the two states get different fuses. */
  onReconcile: (payslipId: string) => Promise<{ status: string; changed: boolean }>;
  /** Records this cutoff as paid outside Linara (cash, bank, other). */
  onRecordOffApp?: (helperId: string, payment: ManualPayment) => Promise<unknown>;
  /** Takes back an outside-Linara record she hasn't confirmed. */
  onWithdrawOffApp?: (payslipId: string) => Promise<void>;
}) {
  /** The channel whose confirm step is open; nothing is sent until it's confirmed. */
  const [paying, setPaying] = useState<PayoutChannelCode | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [recording, setRecording] = useState(false);
  // Paying her GCash / Maya directly (KNOWN_GAPS O35).
  const [payingDirect, setPayingDirect] = useState(false);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  if (!helper) return null;

  const helperPayslips = payslips.filter((p) => p.helperId === helper.id);
  // By overlap: a first or final cutoff is stored with the days she worked.
  const currentCutoffPayslip = cutoff
    ? payslipCovering(helperPayslips, helper.id, cutoff.cutoffStart, cutoff.cutoffEnd)
    : undefined;

  const withdraw = async (payslipId: string) => {
    if (!onWithdrawOffApp) return;
    setWithdrawing(payslipId);
    try {
      await onWithdrawOffApp(payslipId);
      toast.success("Record withdrawn. The period is unpaid again.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't withdraw it.");
    } finally {
      setWithdrawing(null);
    }
  };

  // Recomputed on every render, which is enough: usePayslips polls every 15s
  // while anything is in flight, so the age refreshes with it rather than
  // needing a ticker of its own.
  const staleness = currentCutoffPayslip
    ? payoutStaleness(currentCutoffPayslip, Date.now())
    : { ageMinutes: 0, isStale: false, advice: null };

  const reconcile = async () => {
    if (!currentCutoffPayslip) return;
    setReconciling(true);
    try {
      const result = await onReconcile(currentCutoffPayslip.id);
      if (!result.changed) {
        toast.info("Walang pagbabago — ganoon pa rin ang sabi ng Xendit.");
      } else if (result.status === "succeeded") {
        toast.success("Nakumpirma: natanggap na ang payout.");
      } else if (result.status === "failed" || result.status === "cancelled") {
        toast.warning("Hindi natuloy ang payout sa Xendit. Pwede nang subukan ulit.");
      } else {
        toast.info("Nasa Xendit pa rin ang payout — hindi pa tapos.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hindi ma-check ang Xendit.");
    } finally {
      setReconciling(false);
    }
  };

  return (
    <div className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-muted-foreground block">{label}</span>
          <h3 className="font-display text-lg text-foreground">
            {cutoff ? formatCutoffRange(cutoff.cutoffStart, cutoff.cutoffEnd) : "…"}
          </h3>
          {estimate !== undefined && !currentCutoffPayslip && (
            <span className="text-xs text-muted-foreground">
              About <span className="font-semibold text-foreground">{fmtPeso(estimate)}</span> to
              send
            </span>
          )}
        </div>
        {!cutoff ? (
          <span className="text-xs text-muted-foreground">Loading cutoff…</span>
        ) : currentCutoffPayslip ? (
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={currentCutoffPayslip.payoutStatus} />
            {currentCutoffPayslip.payoutStatus === "needs_review" && (
              <span className="text-xs text-terracotta-ink text-right max-w-[11rem]">
                Reconcile against Xendit before retrying.
              </span>
            )}
            {/* A payout that has stopped moving looks exactly like one that is
                merely young -- both render "Sending…" indefinitely. Past the
                threshold, say so and offer the only safe action: ask Xendit.
                NOT "retry": pending_send may already have reached them, and
                assuming otherwise is how a cutoff gets paid twice. */}
            {staleness.isStale && (
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-terracotta-ink text-right max-w-[13rem]">
                  Stuck for {formatAge(staleness.ageMinutes)}. {staleness.advice}
                </span>
                <button
                  onClick={reconcile}
                  disabled={reconciling}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-terracotta/50 bg-terracotta-soft/50 px-3 py-1 text-xs font-semibold text-accent-foreground transition hover:bg-terracotta-soft disabled:opacity-60"
                >
                  <RefreshCw className={`h-3 w-3 ${reconciling ? "animate-spin" : ""}`} />
                  {reconciling ? "Checking…" : "Check with Xendit"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            {!XENDIT_PAYOUTS_ON && onRecordOffApp && (
              <button
                onClick={() => setPayingDirect(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep"
              >
                <Smartphone className="h-3.5 w-3.5" />
                Pay by GCash or Maya
              </button>
            )}
            {XENDIT_PAYOUTS_ON && (
              <>
                <button
                  onClick={() => setPaying("PH_GCASH")}
                  disabled={paying !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep disabled:opacity-60"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Pay via GCash
                </button>
                <button
                  onClick={() => setPaying("PH_PAYMAYA")}
                  disabled={paying !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary disabled:opacity-60"
                >
                  <Smartphone className="h-3.5 w-3.5 text-accent" />
                  Pay via Maya
                </button>
              </>
            )}
            {onRecordOffApp && (
              <button
                onClick={() => setRecording(true)}
                disabled={paying !== null}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground disabled:opacity-60"
              >
                <Banknote className="h-3.5 w-3.5" /> Paid outside Linara
              </button>
            )}
          </div>
        )}
      </div>
      {paying && cutoff && (
        <PayoutConfirmModal
          helperName={helper.short}
          phone={helper.phone}
          channel={paying}
          periodLabel={formatCutoffRange(cutoff.cutoffStart, cutoff.cutoffEnd)}
          estimate={estimate}
          onClose={() => setPaying(null)}
          onConfirm={() => onPayNow(helper.id, paying)}
        />
      )}
      {payingDirect && cutoff && onRecordOffApp && (
        <PayDirectModal
          helperId={helper.id}
          helperName={helper.short}
          periodLabel={formatCutoffRange(cutoff.cutoffStart, cutoff.cutoffEnd)}
          onClose={() => setPayingDirect(false)}
          onSubmit={async (payment) => {
            const result = await onRecordOffApp(helper.id, payment);
            toast.success(`Recorded. ${helper.short} will be asked to confirm it arrived.`);
            return result;
          }}
        />
      )}
      {recording && cutoff && onRecordOffApp && (
        <RecordPaymentModal
          helperName={helper.short}
          periodLabel={formatCutoffRange(cutoff.cutoffStart, cutoff.cutoffEnd)}
          estimate={estimate ?? 0}
          onClose={() => setRecording(false)}
          onSubmit={async (payment) => {
            await onRecordOffApp(helper.id, payment);
            toast.success(`Recorded. ${helper.short} will be asked to confirm it.`);
          }}
        />
      )}

      {helperPayslips.length > 0 && (
        <div className="mt-4 divide-y divide-border/70 border-t border-border/40 pt-1.5">
          {helperPayslips.map((p) => {
            const manual = p.payoutProvider === "manual";
            return (
              <div key={p.id} className="py-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-foreground">{fmtPeso(p.netPay)}</span>
                    <span className="ml-2 text-muted-foreground">
                      {p.kind === "thirteenth_month"
                        ? `13th-month pay ${p.cutoffEnd.slice(0, 4)}`
                        : formatCutoffRange(p.cutoffStart, p.cutoffEnd)}{" "}
                      · {METHOD_LABEL[p.payoutChannelCode] ?? p.payoutChannelCode}
                      {manual ? " (outside Linara)" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {manual ? <AckChip payslip={p} /> : <StatusBadge status={p.payoutStatus} />}
                    {manual && p.helperAck !== "confirmed" && onWithdrawOffApp && (
                      <button
                        onClick={() => withdraw(p.id)}
                        disabled={withdrawing === p.id}
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-60"
                      >
                        <Undo2 className="h-3 w-3" /> Withdraw
                      </button>
                    )}
                  </div>
                </div>
                {p.unpaidLeaveDeduction > 0 && (
                  <p className="mt-1 text-muted-foreground">
                    After {fmtPeso(p.unpaidLeaveDeduction)} unpaid leave ({p.unpaidLeaveDays}{" "}
                    {p.unpaidLeaveDays === 1 ? "day" : "days"})
                  </p>
                )}
                {manual && (p.manualNote || p.helperAckNote) && (
                  <p className="mt-1 text-muted-foreground">
                    {p.manualNote ? `Your note: ${p.manualNote}` : ""}
                    {p.manualNote && p.helperAckNote ? " · " : ""}
                    {p.helperAckNote ? `She says: "${p.helperAckNote}"` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
