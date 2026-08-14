import { CalendarClock, ArrowUpRight, ArrowDownRight, Sparkles } from "lucide-react";
import { useGrocery } from "@/features/groceries/grocery-context";
import { fmtPeso } from "@/features/groceries/grocery.utils";
import { useAppStores } from "../app-store-context";
import { ledgerEntryMinutes } from "@/features/ledger/ledger.utils";
import { computeStatutorySplit, cutoffsPerMonth } from "@/features/people/people.utils";
import type { Helper } from "@/features/people/people.types";

/**
 * `helper` is optional -- omitted, this reads `useAppStores().helper` (the
 * Pass board's glance card, which was never meant to be helper-switchable).
 * The Money tab passes its own switcher's selection explicitly instead --
 * see MULTI_HELPER_HANDLING.md.
 */
export function SpendAndPayday({ helper: helperOverride }: { helper?: Helper | null } = {}) {
  const { spent, budget, remaining } = useGrocery();
  const { vales, ledger, helper: currentHelper } = useAppStores();
  const helper = helperOverride !== undefined ? helperOverride : currentHelper;

  // 1. Spend Dial Calculations
  const spendPct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const isSpendOver = spent > budget;

  // Circular SVG configuration
  const radius = 24;
  const strokeWidth = 5;
  const circumference = 2 * Math.PI * radius;
  const spendDashoffset = circumference - (spendPct / 100) * circumference;

  // 2. Pay Dial Calculations -- KNOWN_GAPS.md Closed Gap C16: real
  // helper_profiles.monthly_rate/.payday_interval and the real Batas
  // Kasambahay statutory split (computeStatutorySplit), same math as
  // LINARA_MOBILE's DigitalPayslip, in place of the old hardcoded
  // baseSalary = 8000 / governmentDeductions = 240.
  const monthlyRate = helper?.monthlyRate ?? 0;
  const cutoffs = cutoffsPerMonth(helper?.paydayInterval ?? "semi_monthly");
  const isPerCutoff = cutoffs > 1;
  const baseSalary = monthlyRate / cutoffs;
  const statutorySplit = computeStatutorySplit(monthlyRate);
  const governmentDeductions = statutorySplit.totalEmployee / cutoffs;

  // Sum up approved-but-not-yet-paid-out vales for current helper. Excludes
  // vales already settled against a past payslip (Payslip payout_status !=
  // 'failed') -- otherwise a vale deducted from a prior cutoff's payout
  // would keep shrinking this live "next payday" estimate forever. See
  // supabase/add-payslips-table.sql.
  const approvedValesTotal = vales.vales
    .filter((v) => v.helperId === helper?.id && v.status === "approved" && !v.settledInPayslipId)
    .reduce((s, v) => s + v.amount, 0);

  // Sum up rest-owed minutes -- filtered to this helper. listLedgerEntriesFn
  // fetches every entry in the household (see ledger.actions.ts), so an
  // unfiltered sum here would mix every active helper's rest-owed minutes
  // into whichever one dial happens to be showing.
  const helperLedgerEntries = ledger.entries.filter((e) => e.helperId === helper?.id);
  const totalMin = helperLedgerEntries.reduce((s, e) => s + ledgerEntryMinutes(e), 0);

  const premiumMin = helperLedgerEntries
    .filter((e) => e.resolution === "premium")
    .reduce((s, e) => s + ledgerEntryMinutes(e), 0);

  const restMin = totalMin - premiumMin;
  const restOwedHours = restMin / 60;

  // Custom overtime/accrued hourly rate (e.g. ₱120 per hour)
  const restOwedRate = 120;
  const restOwedEarnings = restOwedHours * restOwedRate;

  // Net Pay = Base Salary - Gov Deductions - Vales + Rest Owed
  const netPay = Math.max(
    0,
    baseSalary - governmentDeductions - approvedValesTotal + restOwedEarnings,
  );

  // Pay Dial scale relative to baseline salary
  const payPct = baseSalary > 0 ? Math.min(100, Math.round((netPay / baseSalary) * 100)) : 0;
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
              Accrued Net Pay (Est.)
            </span>
            <h3 className="font-display text-2xl text-foreground tracking-tight tabular-nums">
              {fmtPeso(netPay)}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Base: <span className="font-semibold text-foreground">{fmtPeso(baseSalary)}</span>{" "}
              {isPerCutoff ? "half-month" : "monthly"}
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
          <div className="flex items-center gap-1 text-muted-foreground font-medium">
            {approvedValesTotal > 0 && (
              <span className="text-destructive inline-flex items-center gap-0.5">
                -{fmtPeso(approvedValesTotal)} vale
              </span>
            )}
            {approvedValesTotal > 0 && restOwedEarnings > 0 && <span>·</span>}
            {restOwedEarnings > 0 && (
              <span className="text-emerald inline-flex items-center gap-0.5">
                +{fmtPeso(restOwedEarnings)} rest hours
              </span>
            )}
            {approvedValesTotal === 0 && restOwedEarnings === 0 && (
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
