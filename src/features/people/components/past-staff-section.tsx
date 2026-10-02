import { ChevronDown, ChevronUp, History } from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/shared/avatar";
import type { ValeRequest } from "@/features/ledger/ledger.types";
import { MissedPeriodsCard } from "@/features/pay/components/missed-periods-card";
import { periodEstimate } from "@/features/pay/period-estimate";
import { PayslipHistory } from "@/features/pay/components/payslip-history";
import type { PayPeriodStore } from "@/features/pay/hooks/use-pay-periods";
import type { PaymentTarget } from "@/features/pay/hooks/use-payslips";
import { useUnpaidLeaveDue } from "@/features/pay/hooks/use-unpaid-leave-due";
import type { OffAppMethod, Payslip, PayoutChannelCode } from "@/features/pay/pay.types";

import type { Helper, Invite } from "../people.types";
import { findHelper, initialsOf } from "../people.utils";

const shortDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * Helpers who have left (KNOWN_GAPS.md O4 / C60). The household's record of
 * them stays readable here -- RA 10361 makes keeping it the employer's job --
 * and this is where whatever they're still owed goes out: the final cutoff,
 * any period that closed unpaid, and 13th-month pay, each by GCash/Maya or
 * recorded as paid outside Linara for her to confirm. Someone who comes back
 * is invited again, as a new employment.
 */
export function PastStaffSection({
  pastStaff,
  helpers,
  payslips,
  payPeriods,
  vales,
  token,
  canPay,
  onPayNow,
  onReconcile,
  onRecordOffApp,
  onWithdrawOffApp,
}: {
  pastStaff: Invite[];
  helpers: Helper[];
  payslips: Payslip[];
  payPeriods: PayPeriodStore;
  vales: ValeRequest[];
  token: string | null;
  canPay: boolean;
  onPayNow: (
    helperId: string,
    channelCode: PayoutChannelCode,
    target?: PaymentTarget,
  ) => Promise<{ status: Payslip["payoutStatus"] }>;
  onReconcile: (payslipId: string) => Promise<{ status: string; changed: boolean }>;
  onRecordOffApp: (
    helperId: string,
    payment: { method: OffAppMethod; paidOn: string; note?: string },
    target?: PaymentTarget,
  ) => Promise<unknown>;
  onWithdrawOffApp: (payslipId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const payslipsVersion = payslips.map((p) => `${p.id}:${p.payoutStatus}`).join(",");
  // A final cutoff takes unpaid leave up to her last day, even leave that ran past it.
  const finalLeave = useUnpaidLeaveDue(
    token,
    pastStaff.flatMap((inv) => {
      const finalPeriod = (payPeriods.byHelper[inv.id] ?? []).find((p) => p.isFinal);
      return finalPeriod && !finalPeriod.payslipId
        ? [{ helperId: inv.id, cutoffEnd: finalPeriod.workedEnd, final: true }]
        : [];
    }),
    payslipsVersion,
  );

  if (pastStaff.length === 0) return null;

  return (
    <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-4">
        <h2 className="font-display text-xl text-foreground">Past staff</h2>
        <p className="text-xs text-muted-foreground">
          People who worked here. Their payslips stay on the household's record, and anything they
          are still owed is paid from here.
        </p>
      </div>
      <div className="divide-y divide-border/70">
        {pastStaff.map((inv) => {
          const helper = findHelper(inv.id, helpers);
          const periods = payPeriods.byHelper[inv.id] ?? [];
          const finalPeriod = periods.find((p) => p.isFinal) ?? null;
          const missed = payPeriods.missed(inv.id);
          const unsettledVales = vales
            .filter(
              (v) => v.helperId === inv.id && v.status === "approved" && !v.settledInPayslipId,
            )
            .reduce((sum, v) => sum + v.amount, 0);
          const owed = (finalPeriod && !finalPeriod.payslipId ? 1 : 0) + missed.length;
          const isOpen = open === inv.id;

          return (
            <div key={inv.id} className="py-3.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-start gap-3">
                <Avatar initials={initialsOf(inv.claimedName || inv.name)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {inv.claimedName || inv.name}
                    </span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-pine-deep">
                      {inv.station}
                    </span>
                    {owed > 0 ? (
                      <span className="rounded-full bg-terracotta/20 px-2 py-0.5 text-xs font-semibold text-[oklch(0.38_0.09_60)]">
                        {owed === 1 ? "1 payment due" : `${owed} payments due`}
                      </span>
                    ) : periods.length > 0 ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        Paid up
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Worked {inv.startedOn ? shortDate(inv.startedOn) : "—"} –{" "}
                    {inv.endedOn ? shortDate(inv.endedOn) : "—"}
                  </div>
                </div>
                <button
                  onClick={() => setOpen(isOpen ? null : inv.id)}
                  aria-expanded={isOpen}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-card px-3 py-1 text-xs font-semibold text-foreground hover:border-primary"
                >
                  <History className="h-3 w-3" /> Pay and payslips
                  {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
              </div>
              {isOpen && (
                <div className="mt-3 space-y-3">
                  <PayslipHistory
                    helper={helper}
                    payslips={payslips}
                    cutoff={
                      finalPeriod
                        ? { cutoffStart: finalPeriod.workedStart, cutoffEnd: finalPeriod.workedEnd }
                        : null
                    }
                    label="Final pay"
                    estimate={
                      finalPeriod
                        ? Math.max(
                            0,
                            periodEstimate(helper, finalPeriod) -
                              unsettledVales -
                              finalLeave(inv.id, finalPeriod.workedEnd).deduction,
                          )
                        : undefined
                    }
                    onPayNow={onPayNow}
                    onReconcile={onReconcile}
                    onRecordOffApp={
                      canPay ? (id, payment) => onRecordOffApp(id, payment) : undefined
                    }
                    onWithdrawOffApp={canPay ? onWithdrawOffApp : undefined}
                  />
                  <MissedPeriodsCard
                    helper={helper}
                    missed={missed}
                    token={token}
                    payslipsVersion={payslipsVersion}
                    unsettledVales={unsettledVales}
                    canPay={canPay}
                    onPayNow={(id, channel, target) => onPayNow(id, channel, target)}
                    onRecordOffApp={(id, payment, target) => onRecordOffApp(id, payment, target)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
