import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";

import { fmtPeso } from "@/features/groceries/grocery.utils";
import type { Helper } from "@/features/people/people.types";

import type { Payslip, PayoutChannelCode } from "../pay.types";
import { currentCutoffRange, formatCutoffRange } from "../pay.utils";

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
          : "text-accent bg-accent/10";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}
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
  onPayNow,
}: {
  helper: Helper | null;
  payslips: Payslip[];
  onPayNow: (
    helperId: string,
    channelCode: PayoutChannelCode,
  ) => Promise<{ status: Payslip["payoutStatus"] }>;
}) {
  const [paying, setPaying] = useState<PayoutChannelCode | null>(null);

  if (!helper) return null;

  const helperPayslips = payslips.filter((p) => p.helperId === helper.id);
  const { cutoffStart, cutoffEnd } = currentCutoffRange(new Date(), helper.paydayInterval);
  const currentCutoffPayslip = helperPayslips.find(
    (p) =>
      p.cutoffStart === cutoffStart && p.cutoffEnd === cutoffEnd && p.payoutStatus !== "failed",
  );

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
    <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block">
            Current cutoff
          </span>
          <h3 className="font-display text-lg text-foreground">
            {formatCutoffRange(cutoffStart, cutoffEnd)}
          </h3>
        </div>
        {currentCutoffPayslip ? (
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={currentCutoffPayslip.payoutStatus} />
            {currentCutoffPayslip.payoutStatus === "needs_review" && (
              <span className="text-[10px] text-amber-600 text-right max-w-[11rem]">
                Reconcile against Xendit before retrying.
              </span>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => pay("PH_GCASH")}
              disabled={paying !== null}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep disabled:opacity-60"
            >
              <Smartphone className="h-3.5 w-3.5" />
              {paying === "PH_GCASH" ? "Sending…" : "Pay via GCash"}
            </button>
            <button
              onClick={() => pay("PH_PAYMAYA")}
              disabled={paying !== null}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground transition hover:bg-secondary disabled:opacity-60"
            >
              <Smartphone className="h-3.5 w-3.5 text-accent" />
              {paying === "PH_PAYMAYA" ? "Sending…" : "Pay via Maya"}
            </button>
          </div>
        )}
      </div>

      {helperPayslips.length > 0 && (
        <div className="mt-4 space-y-1.5 border-t border-border/40 pt-3.5">
          {helperPayslips.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-border/50 px-3 py-2 text-xs"
            >
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
