import { CalendarClock, ArrowUpRight, ArrowDownRight, Sparkles, CheckCircle2 } from "lucide-react";
import { useGrocery } from "@/features/groceries/grocery-context";
import { fmtPeso } from "@/features/groceries/grocery.utils";
import { useAppStores } from "../app-store-context";
import { fmtHoursMinutes } from "@/features/ledger/ledger.utils";
import { useHouseholdPayroll } from "@/features/pay/hooks/use-household-payroll";
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
  const { spent, budget, remaining } = useGrocery();
  const { vales, payslips, activeHelpers, session } = useAppStores();

  const scoped = helperOverride ? [helperOverride] : activeHelpers;
  const payroll = useHouseholdPayroll({
    token: session.token,
    ready: session.status === "authed",
    helpers: scoped,
    vales: vales.vales,
    payslips: payslips.payslips,
  });
  const isHouseholdView = !helperOverride;

  // 1. Spend Dial Calculations
  const spendPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const isSpendOver = spent > budget;

  // Circular SVG configuration
  const radius = 24;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const spendDashoffset = circumference - (spendPct / 100) * circumference;

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

  const cutoffTotal = dueTotal + paidTotal + inFlightTotal;
  const allSettled = !payroll.loading && rows.length > 0 && dueTotal === 0;

  // The ring reads "how much of this cutoff's payroll is settled", which is the
  // question a glance is actually asking. It fills as helpers get paid, rather
  // than the old "net as a fraction of base", which barely moved and meant
  // little.
  const settledPct =
    cutoffTotal > 0
      ? Math.min(100, Math.round(((paidTotal + inFlightTotal) / cutoffTotal) * 100))
      : 0;

  const valeDeductionsTotal = rows.reduce((sum, r) => sum + r.valeDeductions, 0);
  const paidCount = rows.filter((r) => r.state === "paid").length;

  const payPct = settledPct;
  const payDashoffset = circumference - (payPct / 100) * circumference;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* 📈 Spend Dial Card */}
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft hover:shadow-md transition duration-200">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block">
              Petty Cash Spend
            </span>
            <h3 className="font-display text-2xl text-foreground tracking-tight tabular-nums">
              {fmtPeso(spent)}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              out of <span className="font-semibold text-foreground">{fmtPeso(budget)}</span> weekly
              target
            </p>
          </div>

          {/* Circular Progress Ring */}
          <div className="relative h-16 w-16 shrink-0 flex items-center justify-center">
            <svg className="h-full w-full -rotate-90">
              <circle
                cx="32"
                cy="32"
                r={radius}
                className="stroke-secondary fill-transparent"
                strokeWidth={strokeWidth}
              />
              <circle
                cx="32"
                cy="32"
                r={radius}
                className={`fill-transparent transition-all duration-300 ${
                  isSpendOver ? "stroke-destructive" : "stroke-primary"
                }`}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={spendDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-[10px] font-bold tabular-nums">
              {Math.round(spendPct)}%
            </div>
          </div>
        </div>

        {/* Micro status details */}
        <div className="mt-4 pt-3.5 border-t border-border/40 flex items-center justify-between text-[11px]">
          <span
            className={`inline-flex items-center gap-1 font-medium ${isSpendOver ? "text-destructive" : "text-emerald"}`}
          >
            {isSpendOver ? (
              <>
                <ArrowUpRight className="h-3 w-3" /> Over by {fmtPeso(spent - budget)}
              </>
            ) : (
              <>
                <ArrowDownRight className="h-3 w-3" /> {fmtPeso(remaining)} available
              </>
            )}
          </span>
          <span className="text-muted-foreground/80 font-mono text-[10px]">PALENGKE LIMIT</span>
        </div>
      </div>

      {/* 📉 Pay Dial Card */}
      <div className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft hover:shadow-md transition duration-200">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground block">
              {isHouseholdView ? "Payroll Due This Cutoff" : "Due This Cutoff"}
            </span>
            <h3 className="font-display text-2xl text-foreground tracking-tight tabular-nums">
              {/* While the cutoff is unknown, show nothing rather than a
                  number. Rendering a peso figure against a cutoff the server
                  has not confirmed is what Session B removed from this app. */}
              {payroll.loading ? "—" : fmtPeso(dueTotal)}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {payroll.loading ? (
                "Checking this cutoff…"
              ) : allSettled ? (
                <span className="inline-flex items-center gap-1 text-emerald font-semibold">
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

          {/* Circular Progress Ring */}
          <div className="relative h-16 w-16 shrink-0 flex items-center justify-center">
            <svg className="h-full w-full -rotate-90">
              <circle
                cx="32"
                cy="32"
                r={radius}
                className="stroke-secondary fill-transparent"
                strokeWidth={strokeWidth}
              />
              <circle
                cx="32"
                cy="32"
                r={radius}
                className="stroke-accent fill-transparent transition-all duration-300"
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={payDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-[10px] font-bold tabular-nums text-accent">
              {payPct}%
            </div>
          </div>
        </div>

        {/* Breakdown details */}
        <div className="mt-4 pt-3.5 border-t border-border/40 flex items-center justify-between text-[11px]">
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
            {valeDeductionsTotal > 0 && restOwedMin > 0 && <span>·</span>}
            {restOwedMin > 0 && (
              // Time, not pesos, and deliberately NOT part of net pay -- it is
              // redeemed as time off, not added to the payout. The figure is
              // rest_owed_balance_minutes, the same number the rest-off card
              // and the helper's own app show, so the three cannot disagree.
              <span className="text-accent inline-flex items-center gap-0.5">
                {fmtHoursMinutes(restOwedMin)} rest owed
              </span>
            )}
            {needsReviewCount === 0 &&
              inFlightTotal === 0 &&
              valeDeductionsTotal === 0 &&
              restOwedMin === 0 && (
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-accent" /> Normal cutoff cycle
                </span>
              )}
          </div>
          <span className="text-muted-foreground/80 inline-flex items-center gap-1 font-mono text-[10px]">
            <CalendarClock className="h-3 w-3" /> PAYDAY GAUGE
          </span>
        </div>
      </div>
    </div>
  );
}
