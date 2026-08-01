import { Camera, Wallet } from "lucide-react";

import { useGrocery } from "../grocery-context";
import { fmtPeso } from "../grocery.utils";

export function TodaysSpendDial() {
  const ctx = useGrocery();
  const over = ctx.spent > ctx.budget;
  const pct = ctx.budget > 0 ? Math.min(100, (ctx.spent / ctx.budget) * 100) : 0;
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Today's spend
        </div>
        <button
          onClick={ctx.openModal}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
        >
          <Wallet className="h-3 w-3" /> Palengke run
        </button>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-display text-2xl tabular-nums text-foreground">
          {fmtPeso(ctx.spent)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">/ {fmtPeso(ctx.budget)}</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full ${over ? "bg-[oklch(0.55_0.18_35)]" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span
          className={`tabular-nums ${over ? "font-semibold text-[oklch(0.5_0.17_35)]" : "text-muted-foreground"}`}
        >
          {over
            ? `over by ${fmtPeso(ctx.spent - ctx.budget)}`
            : `${fmtPeso(ctx.remaining)} remaining`}
        </span>
        {ctx.receiptPhoto ? (
          <button
            onClick={ctx.openModal}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Camera className="h-3 w-3" /> Receipt
          </button>
        ) : (
          <span className="text-muted-foreground/70">No receipt yet</span>
        )}
      </div>
    </div>
  );
}
