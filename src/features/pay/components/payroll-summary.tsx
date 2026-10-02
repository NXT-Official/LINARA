import { ChevronRight } from "lucide-react";

import { Avatar } from "@/components/shared/avatar";
import { useAppStores } from "@/features/dashboard/app-store-context";
import { fmtPeso } from "@/features/groceries/grocery.utils";

import { useHouseholdPayroll, type PayrollState } from "../hooks/use-household-payroll";
import { formatCutoffRange } from "../pay.utils";

const STATE_LABEL: Record<PayrollState, string> = {
  due: "Due",
  in_flight: "Sending",
  needs_review: "Needs review",
  paid: "Paid",
};

const STATE_TONE: Record<PayrollState, string> = {
  due: "bg-terracotta-soft/60 text-terracotta-ink",
  in_flight: "bg-secondary text-pine-deep",
  needs_review: "bg-destructive/10 text-destructive",
  paid: "bg-primary/10 text-primary",
};

/**
 * Every helper's pay for their current cutoff, on one card (client feedback,
 * 2026-10-02: "option to view total staff salaries due. Right now shows one
 * by one", and say which cutoff it is). Same numbers as the Pass's payroll
 * dial (useHouseholdPayroll). A row opens that helper's payslips and pay
 * buttons below; nothing is paid from here.
 */
export function PayrollSummary({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (helperId: string) => void;
}) {
  const { vales, payslips, payPeriods, activeHelpers, session, timeOff } = useAppStores();
  const payroll = useHouseholdPayroll({
    token: session.token,
    ready: session.status === "authed",
    helpers: activeHelpers,
    vales: vales.vales,
    payslips: payslips.payslips,
    payPeriods: payPeriods.byHelper,
    leaveVersion: timeOff.leave,
  });

  if (activeHelpers.length === 0) return null;

  const ranges = new Set(
    payroll.rows.flatMap((r) =>
      r.cutoff ? [formatCutoffRange(r.cutoff.cutoffStart, r.cutoff.cutoffEnd)] : [],
    ),
  );
  // Semi-monthly and monthly helpers can be on different cutoffs at once.
  const heading = ranges.size === 1 ? [...ranges][0] : "Current cutoffs";
  const total = payroll.rows.reduce((sum, r) => sum + r.netPay, 0);
  const paidCount = payroll.rows.filter((r) => r.state === "paid").length;

  return (
    <section
      aria-labelledby="payroll-summary-title"
      className="rounded-3xl bg-card p-5 shadow-soft sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="payroll-summary-title" className="font-display text-xl text-foreground">
            Payroll · {payroll.loading ? "…" : heading}
          </h2>
          <p className="text-xs text-muted-foreground">
            {payroll.loading
              ? "Checking this cutoff…"
              : `${paidCount} of ${payroll.rows.length} paid · ${fmtPeso(total)} for everyone this cutoff`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-muted-foreground">Still to pay</div>
          <div className="font-display text-2xl tabular-nums text-foreground">
            {payroll.loading ? "—" : fmtPeso(payroll.dueTotal)}
          </div>
        </div>
      </div>

      <div className="mt-3 divide-y divide-border/70 border-t border-border/40">
        {payroll.rows.map((r) => {
          const selected = r.helper.id === selectedId;
          return (
            <button
              key={r.helper.id}
              type="button"
              onClick={() => onSelect(r.helper.id)}
              aria-current={selected ? "true" : undefined}
              className={`flex w-full items-center gap-3 py-3 text-left transition hover:bg-secondary/30 ${
                selected ? "bg-primary/5" : ""
              }`}
            >
              <Avatar initials={r.helper.initials} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {r.helper.name}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {r.cutoff ? formatCutoffRange(r.cutoff.cutoffStart, r.cutoff.cutoffEnd) : "…"}
                  {r.valeDeductions > 0 ? ` · −${fmtPeso(r.valeDeductions)} vale` : ""}
                  {r.unpaidLeaveDeduction > 0
                    ? ` · −${fmtPeso(r.unpaidLeaveDeduction)} unpaid leave`
                    : ""}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-sm font-semibold tabular-nums text-foreground">
                  {payroll.loading ? "—" : fmtPeso(r.netPay)}
                </span>
                <span
                  className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATE_TONE[r.state]}`}
                >
                  {STATE_LABEL[r.state]}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          );
        })}
      </div>
    </section>
  );
}
