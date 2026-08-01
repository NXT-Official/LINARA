import { X } from "lucide-react";

import type { Routine } from "../task.types";
import { RecurrenceBadge } from "./recurrence-badge";

export function RoutineRow({ routine, onRemove }: { routine: Routine; onRemove: () => void }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">{routine.title}</h4>
            <RecurrenceBadge recurrence={routine.recurrence} />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{routine.time}</div>
          {routine.note && (
            <div className="mt-2 rounded-xl bg-terracotta-soft/40 px-2.5 py-1.5 text-xs leading-relaxed text-pine-deep">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-pine-deep/70">
                House standard ·
              </span>
              {routine.note}
            </div>
          )}
        </div>
        <button
          onClick={onRemove}
          aria-label="Remove routine"
          className="rounded-full border border-border p-1.5 text-muted-foreground transition hover:border-accent/60 hover:text-accent-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
