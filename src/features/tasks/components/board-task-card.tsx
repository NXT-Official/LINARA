import { HelpCircle, Link2 } from "lucide-react";
import { useState } from "react";

import { PalengkeChip } from "@/features/groceries/components/palengke-chip";
import { STATION_HEX } from "@/features/people/people.constants";
import { helperById } from "@/features/people/people.utils";

import type { Task } from "../task.types";
import { isPalengke } from "../task.utils";
import { RecurrenceBadge } from "./recurrence-badge";

export function BoardTaskCard({
  task,
  late,
  isDoing,
}: {
  task: Task;
  late: boolean;
  isDoing: boolean;
}) {
  const [showNote, setShowNote] = useState(false);
  const helper = helperById(task.helperId);
  const color = STATION_HEX[task.station];
  const isDone = task.status === "done";
  return (
    <article
      className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft"
      style={{ borderLeft: `4px solid ${color.solid}` }}
    >
      <div className="flex items-start gap-2.5 p-3">
        <span className="w-14 shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {task.time}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4
              className={`text-sm font-semibold ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}
            >
              {task.title}
            </h4>
            {isDoing && (
              <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-foreground">
                Doing
              </span>
            )}
            {late && (
              <span className="rounded-full bg-[oklch(0.93_0.06_35)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[oklch(0.42_0.15_35)]">
                Late
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ backgroundColor: color.soft, color: "var(--pine-deep)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color.solid }} />
              {task.station} · {helper.short}
            </span>
            <RecurrenceBadge recurrence={task.recurrence} />
            {task.appointmentTitle && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-pine-deep">
                <Link2 className="h-2.5 w-2.5" /> {task.appointmentTitle}
              </span>
            )}
            {task.note && (
              <button
                onClick={() => setShowNote((s) => !s)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
              >
                <HelpCircle className="h-2.5 w-2.5" /> {showNote ? "Hide note" : "Note"}
              </button>
            )}
            {isPalengke(task) && <PalengkeChip />}
          </div>
          {showNote && task.note && (
            <p className="mt-2 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
              "{task.note}"
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
