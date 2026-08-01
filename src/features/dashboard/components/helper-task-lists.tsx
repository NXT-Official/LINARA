import { AlertCircle, HelpCircle, Link2 } from "lucide-react";

import { PalengkeChip } from "@/features/groceries/components/palengke-chip";
import { NextTaskCard } from "@/features/tasks/components/next-task-card";
import { RecurrenceBadge } from "@/features/tasks/components/recurrence-badge";
import { RescheduleNotice } from "@/features/tasks/components/reschedule-notice";
import type { Status, Task } from "@/features/tasks/task.types";
import { isPalengke } from "@/features/tasks/task.utils";

/**
 * The helper's day, in the order she needs it: the one task in front of her, then
 * what's later, what's stuck waiting on a manager, and what's already done.
 */
export function HelperTaskLists({
  next,
  upcoming,
  blocked,
  completed,
  onUpdate,
  onAskBlock,
}: {
  next: Task | undefined;
  upcoming: Task[];
  blocked: Task[];
  completed: Task[];
  onUpdate: (id: string, status: Status, photo?: string) => void;
  onAskBlock: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      {next && (
        <NextTaskCard task={next} onUpdate={onUpdate} onAskBlock={() => onAskBlock(next.id)} />
      )}
      {upcoming.length > 0 && (
        <div>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Later today
          </h3>
          <div className="space-y-2">
            {upcoming.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft"
              >
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-semibold text-pine-deep">
                    {t.time.split(" ")[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{t.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="truncate text-xs text-muted-foreground">{t.time}</span>
                      <RecurrenceBadge recurrence={t.recurrence} />
                      {t.appointmentTitle && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-1.5 py-0.5 text-[10px] font-medium text-[oklch(0.38_0.09_60)]">
                          <Link2 className="h-2.5 w-2.5" /> {t.appointmentTitle}
                        </span>
                      )}
                      {isPalengke(t) && <PalengkeChip compact />}
                    </div>
                  </div>
                  {t.status === "in_progress" && (
                    <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                      In progress
                    </span>
                  )}
                  <button
                    onClick={() => onAskBlock(t.id)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:border-accent/60 hover:text-accent-foreground"
                    aria-label="Can't now or need info"
                  >
                    <HelpCircle className="h-3 w-3" /> Can't now
                  </button>
                </div>
                <RescheduleNotice notice={t.rescheduleNotice} newTime={t.time} />
              </div>
            ))}
          </div>
        </div>
      )}
      {blocked.length > 0 && (
        <div>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Waiting for Ma'am · {blocked.length}
          </h3>
          <div className="space-y-2">
            {blocked.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-terracotta/40 bg-terracotta-soft/40 p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{t.title}</div>
                    <div className="text-[11px] text-muted-foreground">{t.time}</div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                    <AlertCircle className="h-3 w-3" /> Blocked
                  </span>
                </div>
                <p className="mt-1.5 rounded-xl bg-card/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
                  "{t.blockReason}"
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {completed.length > 0 && (
        <div>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Done · {completed.length}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {completed.map((t) => (
              <div
                key={t.id}
                className="rounded-2xl border border-border/70 bg-card p-2 shadow-soft"
              >
                {t.photo && (
                  <img src={t.photo} alt="" className="mb-2 h-16 w-full rounded-lg object-cover" />
                )}
                <div className="line-clamp-1 px-1 text-xs font-semibold text-foreground">
                  {t.title}
                </div>
                <div className="px-1 text-[10px] text-muted-foreground">{t.time}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
