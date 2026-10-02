import { AlertCircle, Banknote, Gift, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CappedList } from "@/components/shared/capped-list";
import { fmtPeso } from "@/features/groceries/grocery.utils";
import type { Helper } from "@/features/people/people.types";

import type { PaymentTarget } from "../hooks/use-payslips";
import { daysWorked } from "../net-pay";
import { periodEstimate } from "../period-estimate";
import { getThirteenthMonthFn } from "../pay.actions";
import type {
  OffAppMethod,
  PayPeriod,
  Payslip,
  PayoutChannelCode,
  ThirteenthMonth,
} from "../pay.types";
import { formatCutoffRange } from "../pay.utils";
import { PayoutConfirmModal } from "./payout-confirm-modal";
import { RecordPaymentModal } from "./record-payment-modal";

const longDay = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });

type Recording = { target: PaymentTarget; label: string; estimate: number };
type Paying = Recording & { channel: PayoutChannelCode };

/**
 * Pay periods that closed with nothing paid (KNOWN_GAPS.md O16), and her
 * 13th-month pay (O15). Each can go out through Linara (GCash/Maya) or be
 * recorded as paid outside it, for her to confirm. The current cutoff lives
 * in PayslipHistory above; this is everything else still owed.
 */
export function MissedPeriodsCard({
  helper,
  missed,
  token,
  payslipsVersion,
  unsettledVales,
  canPay,
  onPayNow,
  onRecordOffApp,
}: {
  helper: Helper;
  missed: PayPeriod[];
  token: string | null;
  /** Changes when a payslip is written, so 13th-month status refetches. */
  payslipsVersion: string;
  /** Approved vale not yet deducted: comes off whichever payment goes first. */
  unsettledVales: number;
  canPay: boolean;
  onPayNow: (
    helperId: string,
    channel: PayoutChannelCode,
    target: PaymentTarget,
  ) => Promise<{ status: Payslip["payoutStatus"] }>;
  onRecordOffApp: (
    helperId: string,
    payment: { method: OffAppMethod; paidOn: string; note?: string },
    target: PaymentTarget,
  ) => Promise<unknown>;
}) {
  const [thirteenth, setThirteenth] = useState<ThirteenthMonth | null>(null);
  /** The payment whose confirm step is open; nothing is sent until it's confirmed. */
  const [paying, setPaying] = useState<Paying | null>(null);
  const [recording, setRecording] = useState<Recording | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getThirteenthMonthFn({ data: { token, helperId: helper.id } })
      .then((t) => !cancelled && setThirteenth(t))
      .catch(() => !cancelled && setThirteenth(null));
    return () => {
      cancelled = true;
    };
  }, [token, helper.id, payslipsVersion]);

  const showThirteenth = thirteenth && thirteenth.amount > 0;
  if (missed.length === 0 && !showThirteenth) return null;
  // Before vale: whatever is still owed comes off only the first payment.
  const missedTotal = missed.reduce((sum, p) => sum + periodEstimate(helper, p), 0);

  // A plain function, not a component: defined per render, it would remount.
  const actions = ({ target, label, estimate }: Recording) =>
    canPay ? (
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={() => setPaying({ target, label, estimate, channel: "PH_GCASH" })}
          aria-label={`Pay ${label} via GCash`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-60"
        >
          <Smartphone className="h-3.5 w-3.5" /> GCash
        </button>
        <button
          onClick={() => setPaying({ target, label, estimate, channel: "PH_PAYMAYA" })}
          aria-label={`Pay ${label} via Maya`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
        >
          <Smartphone className="h-3.5 w-3.5 text-accent" /> Maya
        </button>
        <button
          onClick={() => setRecording({ target, label, estimate })}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-60"
        >
          <Banknote className="h-3.5 w-3.5" /> Paid outside Linara
        </button>
      </div>
    ) : null;

  return (
    <div className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft">
      {missed.length > 0 && (
        <>
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-ink" aria-hidden />
            <div>
              <h3 className="font-display text-lg text-foreground">
                {missed.length} unpaid pay period{missed.length === 1 ? "" : "s"}
                {missed.length > 1 && (
                  <span className="text-muted-foreground"> · {fmtPeso(missedTotal)}</span>
                )}
              </h3>
              <p className="text-xs text-muted-foreground">
                These cutoffs closed with no payment on record, oldest first. Pay them now, or
                record how they were paid outside Linara.
                {unsettledVales > 0
                  ? ` The ${fmtPeso(unsettledVales)} of vale still owed comes off whichever payment goes first.`
                  : ""}
              </p>
            </div>
          </div>
          <CappedList
            noun={["period", "periods"]}
            className="mt-3 divide-y divide-border/70 border-t border-border/40"
          >
            {missed.map((period) => {
              const estimate = periodEstimate(helper, period);
              const partial =
                period.workedStart !== period.fullStart || period.workedEnd !== period.fullEnd;
              const label = formatCutoffRange(period.workedStart, period.workedEnd);
              return (
                <div key={period.fullStart} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold text-foreground">{label}</span>
                    <span className="tabular-nums text-foreground">{fmtPeso(estimate)}</span>
                  </div>
                  {partial && (
                    <p className="text-xs text-muted-foreground">
                      {daysWorked(period.workedStart, period.workedEnd)} days worked of the cutoff
                    </p>
                  )}
                  {actions({
                    target: { cutoffStart: period.fullStart },
                    label,
                    estimate,
                  })}
                </div>
              );
            })}
          </CappedList>
        </>
      )}

      {showThirteenth && thirteenth && (
        <div className={missed.length > 0 ? "mt-4 border-t border-border/40 pt-4" : ""}>
          <div className="flex items-start gap-2">
            <Gift className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-display text-lg text-foreground">
                  13th-month pay {thirteenth.year}
                </h3>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {fmtPeso(thirteenth.amount)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                A twelfth of the {fmtPeso(thirteenth.basicEarned)} basic pay paid for work since{" "}
                {longDay(thirteenth.periodStart)}. No contributions or vale come out of it.{" "}
                {thirteenth.payslipId
                  ? thirteenth.payslipStatus === "succeeded"
                    ? "Paid."
                    : "On its way."
                  : thirteenth.payable
                    ? `Due by ${longDay(thirteenth.dueBy)}.`
                    : `Payable from ${longDay(thirteenth.payableFrom)}, due by ${longDay(thirteenth.dueBy)}.`}
              </p>
              {thirteenth.payable &&
                actions({
                  target: { kind: "thirteenth_month" },
                  label: `13th-month pay ${thirteenth.year}`,
                  estimate: thirteenth.amount,
                })}
            </div>
          </div>
        </div>
      )}

      {paying && (
        <PayoutConfirmModal
          helperName={helper.short}
          phone={helper.phone}
          channel={paying.channel}
          periodLabel={paying.label}
          estimate={paying.estimate}
          onClose={() => setPaying(null)}
          onConfirm={() => onPayNow(helper.id, paying.channel, paying.target)}
        />
      )}
      {recording && (
        <RecordPaymentModal
          helperName={helper.short}
          periodLabel={recording.label}
          estimate={recording.estimate}
          onClose={() => setRecording(null)}
          onSubmit={async (payment) => {
            await onRecordOffApp(helper.id, payment, recording.target);
            toast.success(`Recorded. ${helper.short} will be asked to confirm it.`);
          }}
        />
      )}
    </div>
  );
}
