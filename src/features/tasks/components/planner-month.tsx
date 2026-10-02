import { CalendarClock } from "lucide-react";

import type { Appointment } from "@/features/appointments/appointment.types";
import { WEEKDAYS, toISODate } from "@/lib/time";

import { taskTone } from "../planner.utils";
import type { Task } from "../task.types";
import type { PlannerDrag } from "./planner-day-column";
import { TONE_DOT } from "./planner-tone";

const SHOWN_PER_DAY = 3;

/**
 * The month at a glance. Each day shows its first few tasks (on a phone, a
 * dot per task), each dot coloured by where the task stands (TONE_DOT);
 * tapping a day opens its week. Days take dropped tasks too.
 */
export function PlannerMonth({
  days,
  month,
  todayIso,
  nowTs,
  tasksByDay,
  appointmentsByDay,
  drag,
  onOpenDay,
}: {
  days: Date[];
  /** The month being shown (0-11); days outside it are dimmed. */
  month: number;
  todayIso: string;
  nowTs: number;
  tasksByDay: Map<string, Task[]>;
  appointmentsByDay: Map<string, Appointment[]>;
  drag?: PlannerDrag;
  onOpenDay: (day: Date) => void;
}) {
  return (
    <div className="overflow-hidden rounded-3xl bg-card shadow-soft ring-1 ring-border/20">
      <div className="grid grid-cols-7 border-b border-border/60" aria-hidden>
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const iso = toISODate(day);
          const tasks = tasksByDay.get(iso) ?? [];
          const appts = appointmentsByDay.get(iso) ?? [];
          const inMonth = day.getMonth() === month;
          const isToday = iso === todayIso;
          const isPast = iso < todayIso;
          const isOver = drag?.overDay === iso;
          const open = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").length;
          const cancelled = tasks.filter((t) => t.status === "cancelled").length;
          const late = tasks.filter((t) => taskTone(t, nowTs) === "late").length;
          const held = tasks.filter((t) => t.status === "blocked").length;
          const summary = [
            day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
            tasks.length === 0
              ? "nothing planned"
              : `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}${open && open < tasks.length ? `, ${open} still to do` : ""}`,
            late > 0 ? `${late} late` : null,
            held > 0 ? `${held} on hold` : null,
            cancelled > 0 ? `${cancelled} cancelled` : null,
            appts.length > 0 ? `${appts.length} appointment${appts.length === 1 ? "" : "s"}` : null,
          ]
            .filter(Boolean)
            .join(", ");
          const items = [
            ...appts.map((a) => ({ key: a.id, appt: a, task: null })),
            ...tasks.map((t) => ({ key: t.id, appt: null, task: t })),
          ];
          const extra = items.length - SHOWN_PER_DAY;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onOpenDay(day)}
              aria-label={summary}
              {...(drag && !isPast ? drag.dropTarget(iso) : {})}
              className={`flex min-h-16 min-w-0 flex-col items-stretch gap-1 border-b border-r border-border/60 p-1 text-left transition-colors [&:nth-child(7n)]:border-r-0 [&:nth-last-child(-n+7)]:border-b-0 hover:bg-secondary/40 focus-visible:bg-secondary/40 focus-visible:outline-none sm:min-h-28 sm:p-1.5 ${
                inMonth ? "" : "bg-secondary/25"
              } ${isOver ? "bg-primary/10 ring-2 ring-inset ring-primary" : ""}`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center self-center rounded-full text-sm font-semibold tabular-nums sm:self-start ${
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : inMonth && !isPast
                      ? "text-foreground"
                      : "text-muted-foreground"
                }`}
              >
                {day.getDate()}
              </span>

              {/* Phone: a dot per task, an outlined one per appointment. */}
              {items.length > 0 && (
                <span className="flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden>
                  {items
                    .slice(0, 6)
                    .map(({ key, appt, task }) =>
                      appt ? (
                        <span
                          key={key}
                          className="h-1.5 w-1.5 rounded-full ring-1 ring-terracotta-ink"
                        />
                      ) : (
                        <span
                          key={key}
                          className={`h-1.5 w-1.5 rounded-full ${task ? TONE_DOT[taskTone(task, nowTs)] : ""}`}
                        />
                      ),
                    )}
                </span>
              )}

              {/* Wider: the first few, by time. */}
              <span className="hidden min-w-0 flex-col gap-0.5 sm:flex" aria-hidden>
                {items.slice(0, SHOWN_PER_DAY).map(({ key, appt, task }) =>
                  appt ? (
                    <span key={key} className="flex min-w-0 items-center gap-1 text-xs">
                      <CalendarClock className="h-3 w-3 shrink-0 text-terracotta-ink" />
                      <span className="truncate text-foreground">{appt.title}</span>
                    </span>
                  ) : task ? (
                    <span key={key} className="flex min-w-0 items-center gap-1 text-xs">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[taskTone(task, nowTs)]}`}
                      />
                      <span
                        className={`truncate ${
                          task.status === "done" || task.status === "cancelled"
                            ? "text-muted-foreground line-through"
                            : "text-foreground"
                        }`}
                      >
                        {task.title}
                      </span>
                    </span>
                  ) : null,
                )}
                {extra > 0 && (
                  <span className="text-xs font-semibold text-muted-foreground">+{extra} more</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
