import { fmtPeso } from "../grocery.utils";

/** Spent against an amount (a month's budget, or a run's cash), with what's left or over. */
export function BudgetBar({
  spent,
  budget,
  compact,
}: {
  spent: number;
  budget: number;
  compact?: boolean;
}) {
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
  const over = spent > budget;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`font-display ${compact ? "text-lg" : "text-2xl"} tabular-nums text-foreground`}
          >
            {fmtPeso(spent)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">/ {fmtPeso(budget)}</span>
        </div>
        <span
          className={`text-xs font-semibold tabular-nums ${over ? "text-[oklch(0.5_0.17_35)]" : "text-muted-foreground"}`}
        >
          {over ? `over by ${fmtPeso(spent - budget)}` : `${fmtPeso(budget - spent)} left`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all ${over ? "bg-[oklch(0.55_0.18_35)]" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
