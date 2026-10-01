import { History } from "lucide-react";

import type { Task } from "../task.types";

/**
 * "Moved from 6:00 PM when Dinner at Lola's changed", or "Moved from 6:00 PM
 * by Ana": shown on a task whose time shifted, so a co-manager looking at the
 * board knows the time isn't the one they planned. Gone once the task is done.
 */
export function RescheduleNotice({ task }: { task: Task }) {
  const notice = task.rescheduleNotice;
  if (!notice || task.status === "done") return null;
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
      <History className="mt-0.5 h-3 w-3 shrink-0 text-terracotta-ink" aria-hidden />
      <span>
        Moved{notice.movedFrom ? ` from ${notice.movedFrom}` : ""}
        {notice.appointmentTitle ? (
          <>
            {" "}
            when <span className="font-semibold text-foreground">
              {notice.appointmentTitle}
            </span>{" "}
            changed.
          </>
        ) : notice.movedBy ? (
          <>
            {" "}
            by <span className="font-semibold text-foreground">{notice.movedBy}</span>.
          </>
        ) : (
          "."
        )}
      </span>
    </p>
  );
}
