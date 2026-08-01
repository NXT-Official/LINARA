import { useGrocery } from "../grocery-context";
import { fmtPeso } from "../grocery.utils";

export function BudgetBar({ compact }: { compact?: boolean } = {}) {
  const ctx = useGrocery();
  const pct = ctx.budget > 0 ? Math.min(100, (ctx.spent / ctx.budget) * 100) : 0;
  const over = ctx.spent > ctx.budget;
  return (
    <div className={compact ? "" : "rounded-2xl bg-background/60 p-3"}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`font-display ${compact ? "text-lg" : "text-2xl"} tabular-nums text-foreground`}
          >
            {fmtPeso(ctx.spent)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            / {fmtPeso(ctx.budget)}
          </span>
        </div>
        <span
          className={`text-[11px] font-semibold tabular-nums ${over ? "text-[oklch(0.5_0.17_35)]" : "text-muted-foreground"}`}
        >
          {over ? `over by ${fmtPeso(ctx.spent - ctx.budget)}` : `${fmtPeso(ctx.remaining)} left`}
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
