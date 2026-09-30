import { ChevronDown, ChevronUp, History } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Avatar } from "@/components/shared/avatar";
import type { ValeRequest } from "@/features/ledger/ledger.types";
import { PayslipHistory } from "@/features/pay/components/payslip-history";
import { payComponentsForCutoff, workedShareOfCutoff } from "@/features/pay/net-pay";
import { getHelperPayCutoffFn, type HelperPayCutoff } from "@/features/pay/pay.actions";
import type { Payslip, PayoutChannelCode } from "@/features/pay/pay.types";

import type { Helper, Invite } from "../people.types";
import { findHelper, initialsOf } from "../people.utils";

const shortDate = (d: Date) =>
  d.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

type FinalPayState = "due" | "in_flight" | "paid" | "unknown";

/**
 * Helpers who have left (KNOWN_GAPS.md O4). The household's record of them
 * stays readable here -- RA 10361 makes keeping it the employer's job -- and
 * this is where their final pay goes out: the same Pay via GCash/Maya flow as
 * any cutoff, for the shortened final one (helper_pay_cutoff). Someone who
 * comes back is invited again, as a new employment.
 */
export function PastStaffSection({
  pastStaff,
  helpers,
  payslips,
  vales,
  token,
  onPayNow,
  onReconcile,
}: {
  pastStaff: Invite[];
  helpers: Helper[];
  payslips: Payslip[];
  vales: ValeRequest[];
  token: string | null;
  onPayNow: (
    helperId: string,
    channelCode: PayoutChannelCode,
  ) => Promise<{ status: Payslip["payoutStatus"] }>;
  onReconcile: (payslipId: string) => Promise<{ status: string; changed: boolean }>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [cutoffs, setCutoffs] = useState<Record<string, HelperPayCutoff>>({});

  const idKey = useMemo(
    () =>
      pastStaff
        .map((p) => p.id)
        .sort()
        .join(","),
    [pastStaff],
  );

  useEffect(() => {
    if (!token || !idKey) return;
    let cancelled = false;
    Promise.all(
      idKey.split(",").map((helperId) =>
        getHelperPayCutoffFn({ data: { token, helperId } })
          .then((c) => [helperId, c] as const)
          .catch(() => null),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setCutoffs(Object.fromEntries(entries.filter((e) => e !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, [token, idKey]);

  if (pastStaff.length === 0) return null;

  return (
    <section className="rounded-3xl ring-1 ring-border/20 bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-4">
        <h2 className="font-display text-xl text-foreground">Past staff</h2>
        <p className="text-xs text-muted-foreground">
          People who worked here. Their payslips stay on the household's record, and their final pay
          is sent from here.
        </p>
      </div>
      <div className="divide-y divide-border/70">
        {pastStaff.map((inv) => {
          const helper = findHelper(inv.id, helpers);
          const cutoff = cutoffs[inv.id] ?? null;
          const finalSlip = cutoff
            ? payslips.find(
                (p) =>
                  p.helperId === inv.id &&
                  p.cutoffStart === cutoff.cutoffStart &&
                  p.cutoffEnd === cutoff.cutoffEnd &&
                  p.payoutStatus !== "failed",
              )
            : undefined;
          const state: FinalPayState = !cutoff
            ? "unknown"
            : !finalSlip
              ? "due"
              : finalSlip.payoutStatus === "succeeded"
                ? "paid"
                : "in_flight";

          const share = cutoff
            ? workedShareOfCutoff(cutoff.cutoffStart, cutoff.cutoffEnd, cutoff.fullCutoffEnd)
            : 1;
          const { basePay, statutoryEmployeeShare } = payComponentsForCutoff(
            helper.monthlyRate,
            helper.paydayInterval,
            share,
          );
          const unsettledVales = vales
            .filter(
              (v) => v.helperId === inv.id && v.status === "approved" && !v.settledInPayslipId,
            )
            .reduce((sum, v) => sum + v.amount, 0);
          const estimate = Math.max(0, basePay - statutoryEmployeeShare - unsettledVales);
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
                    {state === "due" && (
                      <span className="rounded-full bg-terracotta/20 px-2 py-0.5 text-xs font-semibold text-[oklch(0.38_0.09_60)]">
                        Final pay due
                      </span>
                    )}
                    {state === "in_flight" && (
                      <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-terracotta-ink">
                        Final pay sending
                      </span>
                    )}
                    {state === "paid" && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                        Final pay sent
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Worked {shortDate(new Date(inv.createdAt))} –{" "}
                    {inv.endedOn ? shortDate(new Date(`${inv.endedOn}T00:00:00`)) : "—"}
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
                <div className="mt-3">
                  <PayslipHistory
                    helper={helper}
                    payslips={payslips}
                    cutoff={cutoff}
                    label="Final pay"
                    estimate={estimate}
                    onPayNow={onPayNow}
                    onReconcile={onReconcile}
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
