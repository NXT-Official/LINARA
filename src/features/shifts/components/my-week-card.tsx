import { Calendar, Moon, Sparkles } from "lucide-react";

import { WEEKLY_REST_DAY_NAMES } from "@/features/people/people.constants";
import { fmtHM12, WEEKDAY_LONG, WEEKDAYS, weekdayOf } from "@/lib/time";

import type { HelperSchedule } from "../shift.types";
import { daysUntilRestDay, isRestDay } from "../shift.utils";

/** The helper's own read-only week: today's hours and next rest day. */
export function MyWeekCard({
  schedule,
  simDate,
}: {
  schedule: HelperSchedule | undefined;
  simDate: Date;
}) {
  const todayWd = weekdayOf(simDate);

  if (!schedule) {
    return (
      <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
        <h2 className="font-display text-lg text-foreground">My Week</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your shift hasn't been set up yet — check with your manager.
        </p>
      </section>
    );
  }

  const restToday = isRestDay(todayWd, schedule);
  const inDays = daysUntilRestDay(todayWd, schedule.weeklyRestDay);
  const restLabel =
    inDays === 0
      ? "Today — enjoy your rest"
      : inDays === 1
        ? "Tomorrow"
        : `${WEEKLY_REST_DAY_NAMES[schedule.weeklyRestDay]} — ${inDays} days away`;

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-foreground">My Week</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep">
          <Calendar className="h-3 w-3" /> {WEEKDAY_LONG[todayWd]}
        </span>
      </div>

      {/* Today at a glance */}
      <div className="mt-3 rounded-2xl bg-secondary/60 p-3.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-pine-deep/80">
          Today
        </div>
        {restToday ? (
          <div className="mt-1 font-display text-lg text-pine-deep">Rest day — salamat, Ate.</div>
        ) : (
          <>
            <div className="mt-1 font-display text-lg text-pine-deep">
              {fmtHM12(schedule.shiftStart)} – {fmtHM12(schedule.shiftEnd)}
            </div>
            {schedule.breakStart && schedule.breakEnd && (
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-pine-deep">
                <Moon className="h-3 w-3" /> Break {fmtHM12(schedule.breakStart)}–
                {fmtHM12(schedule.breakEnd)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Upcoming rest day */}
      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-terracotta/30 bg-terracotta-soft/40 p-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.55_0.13_60)]" />
        <div className="text-sm text-pine-deep">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-pine-deep/70">
            Rest day
          </div>
          <div className="font-semibold">{restLabel}</div>
        </div>
      </div>

      {/* Week ahead */}
      <div className="mt-4">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Week ahead
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d) => {
            const isToday = d === todayWd;
            const rest = isRestDay(d, schedule);
            return (
              <div
                key={d}
                className={`flex flex-col items-center rounded-xl border px-1 py-1.5 text-[10px] transition ${
                  isToday
                    ? "border-primary bg-primary text-primary-foreground"
                    : rest
                      ? "border-terracotta/40 bg-terracotta-soft/40 text-[oklch(0.38_0.09_60)]"
                      : "border-border/60 bg-background/40 text-foreground"
                }`}
              >
                <span className="font-semibold uppercase tracking-wider">{d}</span>
                <span className="mt-0.5 leading-tight">
                  {rest ? "Rest" : fmtHM12(schedule.shiftStart).replace(" ", "")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
