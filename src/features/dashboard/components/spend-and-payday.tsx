import { CalendarClock } from "lucide-react";

import { TodaysSpendDial } from "@/features/groceries/components/todays-spend-dial";

/** The two money dials shown on both the Pass and Money tabs. */
export function SpendAndPayday() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TodaysSpendDial />
      <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Next payday
          </div>
          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <div className="mt-1.5 font-display text-2xl text-foreground">Jul 15</div>
        <div className="mt-0.5 text-xs text-muted-foreground">8 days away</div>
      </div>
    </div>
  );
}
