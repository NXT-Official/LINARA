import { Calendar, Moon, Sparkles } from "lucide-react";

import { fmtHM12, WEEKDAY_LONG, WEEKDAYS, weekdayOf, type Weekday } from "@/lib/time";

import type { WeekSchedule } from "../shift.types";

// ---------- Rosa's own weekly view ----------
export function MyWeekCard({
  weekSchedule,
  simDate,
}: {
  weekSchedule: WeekSchedule;
  simDate: Date;
}) {
  const todayWd = weekdayOf(simDate);
  const today = weekSchedule[todayWd];
  // Find the next rest day starting from today (0 = today, 1 = tomorrow…).
  const todayIdx = WEEKDAYS.indexOf(todayWd);
  let nextRest: { day: Weekday; inDays: number } | null = null;
  for (let i = 0; i < 7; i++) {
    const d = WEEKDAYS[(todayIdx + i) % 7];
    if (weekSchedule[d].rest) {
      nextRest = { day: d, inDays: i };
      break;
    }
  }
  const restLabel = nextRest
    ? nextRest.inDays === 0
      ? "Today — enjoy your rest"
      : nextRest.inDays === 1
        ? `${WEEKDAY_LONG[nextRest.day]} — tomorrow`
        : `${WEEKDAY_LONG[nextRest.day]} — ${nextRest.inDays} days away`
    : "No rest day set";

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
        {today.rest ? (
          <div className="mt-1 font-display text-lg text-pine-deep">Rest day — salamat, Ate.</div>
        ) : (
          <>
            <div className="mt-1 font-display text-lg text-pine-deep">
              {today.segments.map((s) => `${fmtHM12(s.start)} – ${fmtHM12(s.end)}`).join(" & ")}
            </div>
            {today.breakStart && today.breakEnd && (
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-pine-deep">
                <Moon className="h-3 w-3" /> Break {fmtHM12(today.breakStart)}–
                {fmtHM12(today.breakEnd)}
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
          {WEEKDAYS.map((d, i) => {
            const day = weekSchedule[d];
            const isToday = d === todayWd;
            const rest = day.rest;
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
                  {rest
                    ? "Rest"
                    : day.segments[0]
                      ? fmtHM12(day.segments[0].start).replace(" ", "")
                      : "—"}
                </span>
                {!rest && day.segments.length > 1 && (
                  <span
                    className={`text-[9px] ${isToday ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                  >
                    +split
                  </span>
                )}
                <span aria-hidden className="sr-only">
                  {i}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
