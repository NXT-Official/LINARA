import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Avatar } from "@/components/shared/avatar";
import { useAppStores } from "@/features/dashboard/app-store-context";
import { fmtPeso } from "@/features/groceries/grocery.utils";
import { StaffScopeBar } from "@/features/teams/components/staff-scope-bar";
import { useStaffScope } from "@/features/teams/hooks/use-staff-scope";
import { LARGE_STAFF } from "@/features/teams/teams.constants";

import { useHouseholdPayroll, type PayrollState } from "../hooks/use-household-payroll";
import { formatCutoffRange } from "../pay.utils";
import { manualAckState } from "../payslip-ack";
import { periodEstimate } from "../period-estimate";

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
  paid: "bg-status-done-soft text-status-done-ink",
};

/** A paid row whose payment was recorded outside Linara and not yet confirmed. */
const ACK_LABEL = { recorded: "Recorded", disputed: "Not received" } as const;
const ACK_TONE = {
  recorded: "bg-secondary text-pine-deep",
  disputed: "bg-destructive/10 text-destructive",
} as const;

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
  // Staff shared in from another household are paid there, not here.
  const {
    vales,
    payslips,
    payPeriods,
    employedHelpers: activeHelpers,
    session,
    timeOff,
  } = useAppStores();
  const payroll = useHouseholdPayroll({
    token: session.token,
    ready: session.status === "authed",
    helpers: activeHelpers,
    vales: vales.vales,
    payslips: payslips.payslips,
    payPeriods: payPeriods.byHelper,
    leaveVersion: timeOff.leave,
  });

  // Cutoffs before this one that closed unpaid. The card is about the current
  // cutoff, but "Still to pay ₱0" while earlier ones were owed sent managers
  // away thinking nothing was due. Estimates before vale, as the unpaid
  // periods card shows them.
  const earlier = new Map(
    activeHelpers.map((h) => [
      h.id,
      payPeriods.missed(h.id).reduce((sum, p) => sum + periodEstimate(h, p), 0),
    ]),
  );
  const earlierTotal = [...earlier.values()].reduce((sum, n) => sum + n, 0);

  const staff = useStaffScope();
  const [stateFilter, setStateFilter] = useState<"all" | "unpaid">("all");

  if (activeHelpers.length === 0) return null;

  // A large payroll narrows by name, team and label, and to what's still
  // unpaid, and subtotals by team. The heading's figures stay the household's.
  const rows = staff
    .apply(
      payroll.rows.map((r) => ({
        ...r,
        id: r.helper.id,
        name: r.helper.name,
        teamId: r.helper.teamId,
      })),
    )
    .filter(
      (r) => stateFilter === "all" || r.state !== "paid" || (earlier.get(r.helper.id) ?? 0) > 0,
    );
  const groups = staff.group(rows);
  const large = payroll.rows.length > LARGE_STAFF;

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
              : `${paidCount} of ${payroll.rows.length} paid this cutoff · ${fmtPeso(total)} for everyone`}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-muted-foreground">Still to pay</div>
          <div className="font-display text-2xl tabular-nums text-foreground">
            {payroll.loading ? "—" : fmtPeso(payroll.dueTotal + earlierTotal)}
          </div>
          {!payroll.loading && earlierTotal > 0 && (
            <div className="text-xs font-semibold text-status-late-ink">
              {payroll.dueTotal === 0 ? "All" : fmtPeso(earlierTotal)} from earlier cutoffs
            </div>
          )}
        </div>
      </div>

      {staff.show && (
        <div className="mt-3">
          <StaffScopeBar api={staff} shown={rows.length} total={payroll.rows.length} />
        </div>
      )}
      {large && (
        <div className="mt-3 flex gap-1.5" role="group" aria-label="Which pay to show">
          {(
            [
              ["all", "Everyone"],
              ["unpaid", "Still to pay"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStateFilter(key)}
              aria-pressed={stateFilter === key}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                stateFilter === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {groups ? (
        groups.map((g) => {
          const due = g.items.reduce(
            (n, r) => n + (r.state !== "paid" ? r.netPay : 0) + (earlier.get(r.helper.id) ?? 0),
            0,
          );
          return (
            <PayGroup
              key={g.key}
              title={g.title}
              subtitle={payroll.loading ? "…" : `${fmtPeso(due)} still to pay`}
            >
              {g.items.map(payRow)}
            </PayGroup>
          );
        })
      ) : (
        <PayGroup>{rows.map(payRow)}</PayGroup>
      )}
      {rows.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">Nobody to show.</p>
      )}
    </section>
  );

  function payRow(r: (typeof rows)[number]) {
    const selected = r.helper.id === selectedId;
    const ack = r.state === "paid" ? manualAckState(r.payslip) : null;
    const owedBefore = earlier.get(r.helper.id) ?? 0;
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
            className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${ack ? ACK_TONE[ack] : STATE_TONE[r.state]}`}
          >
            {ack ? ACK_LABEL[ack] : STATE_LABEL[r.state]}
          </span>
          {!payroll.loading && owedBefore > 0 && (
            <span className="block text-xs font-semibold tabular-nums text-status-late-ink">
              +{fmtPeso(owedBefore)} earlier
            </span>
          )}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
    );
  }
}

/** A team's rows on the payroll card, under its name and what it's still owed. */
function PayGroup({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mt-3">
      {title && (
        <h3 className="flex items-baseline justify-between gap-2 pb-1 text-sm font-semibold text-foreground">
          {title}
          {subtitle && (
            <span className="text-xs font-semibold text-muted-foreground">{subtitle}</span>
          )}
        </h3>
      )}
      <div className="divide-y divide-border/70 border-t border-border/40">{children}</div>
    </div>
  );
}
