import { Link } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useGrocery } from "@/features/groceries/grocery-context";
import { fmtPeso } from "@/features/groceries/grocery.utils";
import { useAppStores } from "../app-store-context";
import { fmtHoursMinutes } from "@/features/ledger/ledger.utils";
import { useHouseholdPayroll } from "@/features/pay/hooks/use-household-payroll";
import { formatCutoffRange } from "@/features/pay/pay.utils";
import type { Helper } from "@/features/people/people.types";

/**
 * Spend and payday at a glance.
 *
 * The payday half answers "what does this household still owe for the current
 * cutoff", NOT "what has one helper accrued". Two bugs made that necessary,
 * both first visible on 2026-08-17 when payouts finally reached `succeeded`:
 *
 *   - It never read `payslips`, so a PAID cutoff kept showing its full accrued
 *     amount -- money already sent, displayed as still owed.
 *   - With `helper` omitted it fell back to `activeHelpers[0]`, i.e. whichever
 *     helper was invited most recently, presented with nothing to say so. On a
 *     card designed to be read in two seconds, in a two-helper household, that
 *     is one arbitrary worker's number standing in for the household's.
 *
 * `helper` omitted (the Pass board) now means EVERY active helper, summed.
 * `helper` passed (the Money tab, whose switcher chooses) means just that one.
 * Both read `useHouseholdPayroll`, so the two views cannot disagree, and each
 * helper's figure is computed against their own `payday_interval`'s cutoff --
 * the MULTI_HELPER_HANDLING.md failure mode this card previously embodied.
 */
export function SpendAndPayday({ helper: helperOverride }: { helper?: Helper | null } = {}) {
  const { spent, budget, remaining, runsAvailable } = useGrocery();
  // Pay is for the staff this household employs, not those shared in.
  const {
    vales,
    payslips,
    payPeriods,
    employedHelpers: activeHelpers,
    session,
    timeOff,
  } = useAppStores();

  const scoped = helperOverride ? [helperOverride] : activeHelpers;
  const payroll = useHouseholdPayroll({
    token: session.token,
    ready: session.status === "authed",
    helpers: scoped,
    vales: vales.vales,
    payslips: payslips.payslips,
    payPeriods: payPeriods.byHelper,
    leaveVersion: timeOff.leave,
  });
  const isHouseholdView = !helperOverride;

  // 1. Spend against the budget. A bar only when there is a budget to fill;
  // rings standing in for content are out (DESIGN.md, Don'ts).
  const spendPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const isSpendOver = spent > budget;

  // 2. Pay Dial -- everything below comes from useHouseholdPayroll, which owns
  // the arithmetic (net-pay.ts) AND the payslip lookup. Nothing about pay is
  // computed in this component any more; that separation is what lets the same
  // card serve one helper and a whole household without two sets of rules.
  //
  // After-hours work is TIME OWED, not pesos (KNOWN_GAPS.md C39), so rest owed
  // is rendered beside net pay and never inside it. What was here before:
  // `restOwedEarnings = (totalMin - premiumMin)/60 * 120` added into netPay --
  // money no payout ever contained, at an invented rate, computed off the wrong
  // half of the ledger. Do not reintroduce a peso term from the ledger here.
  const { dueTotal, paidTotal, inFlightTotal, needsReviewCount, restOwedMinutesTotal, rows } =
    payroll;
  const restOwedMin = restOwedMinutesTotal;

  const allSettled = !payroll.loading && rows.length > 0 && dueTotal === 0;

  const valeDeductionsTotal = rows.reduce((sum, r) => sum + r.valeDeductions, 0);
  // Unpaid leave comes out of pay like a vale (LEAVE_PLAN.md step 5).
  const unpaidLeaveTotal = rows.reduce((sum, r) => sum + r.unpaidLeaveDeduction, 0);
  const paidCount = rows.filter((r) => r.state === "paid").length;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Spend */}
      <div className="rounded-3xl bg-card p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-bold text-muted-foreground block">
              {runsAvailable ? "Palengke this month" : "Petty cash spend"}
            </span>
            <h3 className="font-display text-2xl text-foreground tracking-tight tabular-nums">
              {fmtPeso(spent)}
            </h3>
            <p className="text-xs text-muted-foreground">
              {runsAvailable && budget === 0 ? (
                "No monthly budget set"
              ) : (
                <>
                  out of <span className="font-semibold text-foreground">{fmtPeso(budget)}</span>{" "}
                  {runsAvailable ? "monthly budget" : "weekly target"}
                </>
              )}
            </p>
          </div>
        </div>
        {budget > 0 && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full ${isSpendOver ? "bg-status-late" : "bg-primary"}`}
              style={{ width: `${spendPct}%` }}
            />
          </div>
        )}

        {/* Micro status details */}
        <div className="mt-4 pt-3.5 border-t border-border/40 flex items-center justify-between text-xs">
          <span
            className={`inline-flex items-center gap-1 font-medium ${isSpendOver ? "text-status-late-ink" : "text-status-done-ink"}`}
          >
            {runsAvailable && budget === 0 ? (
              <Link to="/manager/pantry" className="font-semibold text-primary hover:underline">
                Set a budget on the Pantry page
              </Link>
            ) : isSpendOver ? (
              <>
                <ArrowUpRight className="h-3 w-3" /> Over by {fmtPeso(spent - budget)}
              </>
            ) : (
              <>
                <ArrowDownRight className="h-3 w-3" /> {fmtPeso(remaining)} available
              </>
            )}
          </span>
        </div>
      </div>

      {/* Payday */}
      <div className="rounded-3xl bg-card p-5 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-xs font-bold text-muted-foreground block">
              {isHouseholdView ? "Payroll due this cutoff" : "Due this cutoff"}
              {/* Which cutoff, so "this cutoff" isn't a guess (client
                  feedback 2026-10-02). One helper has one; the household
                  view can span two intervals, so it names none. */}
              {!isHouseholdView && rows[0]?.cutoff
                ? ` · ${formatCutoffRange(rows[0].cutoff.cutoffStart, rows[0].cutoff.cutoffEnd)}`
                : ""}
            </span>
            <h3 className="font-display text-2xl text-foreground tracking-tight tabular-nums">
              {/* While the cutoff is unknown, show nothing rather than a
                  number. Rendering a peso figure against a cutoff the server
                  has not confirmed is what Session B removed from this app. */}
              {payroll.loading ? "—" : fmtPeso(dueTotal)}
            </h3>
            <p className="text-xs text-muted-foreground">
              {payroll.loading ? (
                "Checking this cutoff…"
              ) : allSettled ? (
                <span className="inline-flex items-center gap-1 text-status-done-ink font-semibold">
                  <CheckCircle2 className="h-3 w-3" />
                  {isHouseholdView
                    ? `All ${rows.length === 1 ? "" : `${rows.length} `}paid this cutoff`
                    : "Paid this cutoff"}
                </span>
              ) : isHouseholdView ? (
                <>
                  across{" "}
                  <span className="font-semibold text-foreground">
                    {rows.length - paidCount} of {rows.length}
                  </span>{" "}
                  {rows.length === 1 ? "helper" : "helpers"}
                </>
              ) : (
                <>
                  Paid so far:{" "}
                  <span className="font-semibold text-foreground">{fmtPeso(paidTotal)}</span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* Breakdown details */}
        <div className="mt-4 pt-3.5 border-t border-border/40 flex items-center justify-between text-xs">
          <div className="flex flex-wrap items-center gap-1 text-muted-foreground font-medium">
            {/* needs_review first: it is the only state a manager must ACT on
                rather than wait out, and it means a payout whose outcome we
                could not determine (pay.actions.ts's failure taxonomy). */}
            {needsReviewCount > 0 && (
              <span className="text-destructive inline-flex items-center gap-0.5 font-semibold">
                {needsReviewCount} needs review
              </span>
            )}
            {needsReviewCount > 0 && inFlightTotal > 0 && <span>·</span>}
            {inFlightTotal > 0 && (
              // Sent, not yet confirmed. Shown so a manager doesn't read it as
              // still-owed and try to pay again -- the RPC would refuse, but
              // the card should not invite it.
              <span className="text-muted-foreground inline-flex items-center gap-0.5">
                {fmtPeso(inFlightTotal)} sending
              </span>
            )}
            {inFlightTotal > 0 && valeDeductionsTotal > 0 && <span>·</span>}
            {valeDeductionsTotal > 0 && (
              <span className="text-destructive inline-flex items-center gap-0.5">
                -{fmtPeso(valeDeductionsTotal)} vale
              </span>
            )}
            {valeDeductionsTotal > 0 && unpaidLeaveTotal > 0 && <span>·</span>}
            {unpaidLeaveTotal > 0 && (
              <span className="text-destructive inline-flex items-center gap-0.5">
                -{fmtPeso(unpaidLeaveTotal)} unpaid leave
              </span>
            )}
            {(valeDeductionsTotal > 0 || unpaidLeaveTotal > 0) && restOwedMin > 0 && <span>·</span>}
            {restOwedMin > 0 && (
              // Time, not pesos, and deliberately NOT part of net pay -- it is
              // redeemed as time off, not added to the payout. The figure is
              // rest_owed_balance_minutes, the same number the rest-off card
              // and the helper's own app show, so the three cannot disagree.
              <span className="text-terracotta-ink inline-flex items-center gap-0.5">
                {fmtHoursMinutes(restOwedMin)} rest owed
              </span>
            )}
            {needsReviewCount === 0 &&
              inFlightTotal === 0 &&
              valeDeductionsTotal === 0 &&
              unpaidLeaveTotal === 0 &&
              restOwedMin === 0 && (
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  Normal cutoff cycle
                </span>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
