import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";

import { fmtPeso } from "@/features/groceries/grocery.utils";
import type { Helper } from "@/features/people/people.types";

import type { HouseholdCutoff } from "../pay.actions";
import type { Payslip, PayoutChannelCode } from "../pay.types";
import { formatAge, payoutStaleness } from "../payout-staleness";
import { formatCutoffRange } from "../pay.utils";

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
      ? "text-emerald bg-emerald/10"
      : status === "failed"
        ? "text-destructive bg-destructive/10"
        : status === "needs_review"
          ? "text-amber-600 bg-amber-500/10"
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
  onPayNow,
  onReconcile,
}: {
  helper: Helper | null;
  payslips: Payslip[];
  /**
   * The current cutoff, derived in Postgres and passed down -- never computed
   * here. `null` while it loads; the Pay buttons stay hidden until it arrives,
   * because without it we cannot tell whether this cutoff was already paid,
   * and showing "Pay via GCash" on a guess is exactly the bug Session B fixes.
   */
  cutoff: HouseholdCutoff | null;
  onPayNow: (
    helperId: string,
    channelCode: PayoutChannelCode,
  ) => Promise<{ status: Payslip["payoutStatus"] }>;
  /** Asks Xendit what really happened to a stuck payout and writes the answer
   *  back. Offered only once `payoutStaleness` says the row has stopped
   *  moving -- see that module for why the two states get different fuses. */
  onReconcile: (payslipId: string) => Promise<{ status: string; changed: boolean }>;
}) {
  const [paying, setPaying] = useState<PayoutChannelCode | null>(null);
  const [reconciling, setReconciling] = useState(false);

  if (!helper) return null;

  const helperPayslips = payslips.filter((p) => p.helperId === helper.id);
  const currentCutoffPayslip = cutoff
    ? helperPayslips.find(
        (p) =>
          p.cutoffStart === cutoff.cutoffStart &&
          p.cutoffEnd === cutoff.cutoffEnd &&
          p.payoutStatus !== "failed",
      )
    : undefined;

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

  const pay = async (channelCode: PayoutChannelCode) => {
    setPaying(channelCode);
    try {
      const result = await onPayNow(helper.id, channelCode);
      if (result?.status === "needs_review") {
        toast.warning(
          "Hindi makumpirma ang payout — naka-hold para i-review. Tignan sa Xendit bago ulitin.",
        );
      } else {
        toast.success(`Payout sent via ${channelCode === "PH_GCASH" ? "GCash" : "Maya"}.`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Hindi na-send ang payout. Subukan ulit.");
    } finally {
      setPaying(null);
    }
  };

  return (
    <div className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold text-muted-foreground block">Current cutoff</span>
          <h3 className="font-display text-lg text-foreground">
            {cutoff ? formatCutoffRange(cutoff.cutoffStart, cutoff.cutoffEnd) : "…"}
          </h3>
        </div>
        {!cutoff ? (
          <span className="text-xs text-muted-foreground">Loading cutoff…</span>
        ) : currentCutoffPayslip ? (
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={currentCutoffPayslip.payoutStatus} />
            {currentCutoffPayslip.payoutStatus === "needs_review" && (
              <span className="text-xs text-amber-600 text-right max-w-[11rem]">
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
                <span className="text-xs text-amber-600 text-right max-w-[13rem]">
                  Stuck for {formatAge(staleness.ageMinutes)}. {staleness.advice}
                </span>
                <button
                  onClick={reconcile}
                  disabled={reconciling}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/20 disabled:opacity-60 dark:text-amber-300"
                >
                  <RefreshCw className={`h-3 w-3 ${reconciling ? "animate-spin" : ""}`} />
                  {reconciling ? "Checking…" : "Check with Xendit"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => pay("PH_GCASH")}
              disabled={paying !== null}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep disabled:opacity-60"
            >
              <Smartphone className="h-3.5 w-3.5" />
              {paying === "PH_GCASH" ? "Sending…" : "Pay via GCash"}
            </button>
            <button
              onClick={() => pay("PH_PAYMAYA")}
              disabled={paying !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary disabled:opacity-60"
            >
              <Smartphone className="h-3.5 w-3.5 text-accent" />
              {paying === "PH_PAYMAYA" ? "Sending…" : "Pay via Maya"}
            </button>
          </div>
        )}
      </div>

      {helperPayslips.length > 0 && (
        <div className="mt-4 divide-y divide-border/70 border-t border-border/40 pt-1.5">
          {helperPayslips.map((p) => (
            <div key={p.id} className="flex items-center justify-between py-2.5 text-xs">
              <div>
                <span className="font-semibold text-foreground">{fmtPeso(p.netPay)}</span>
                <span className="ml-2 text-muted-foreground">
                  {formatCutoffRange(p.cutoffStart, p.cutoffEnd)} ·{" "}
                  {p.payoutChannelCode === "PH_GCASH" ? "GCash" : "Maya"}
                </span>
              </div>
              <StatusBadge status={p.payoutStatus} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
