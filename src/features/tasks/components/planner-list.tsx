import { Plus } from "lucide-react";

import type { Appointment } from "@/features/appointments/appointment.types";
import type { Helper } from "@/features/people/people.types";
import { parseTimeToMinutes, toISODate, weekdayOf } from "@/lib/time";

import type { RoutineGhost } from "../planner.utils";
import type { Task } from "../task.types";
import { PlannerAppointmentRow, PlannerTaskRow, RoutineGhostRow } from "./planner-day-column";

const dayHeading = (day: Date) =>
  day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

type Item =
  | { kind: "appointment"; at: number; appointment: Appointment }
  | { kind: "task"; at: number; task: Task }
  | { kind: "ghost"; at: number; ghost: RoutineGhost };

/**
 * The week as one plain list (KNOWN_GAPS.md O30: the client asked for a
 * "list view", no more said): each day a heading, then its appointments,
 * tasks and routine copies in time order, one full-width row each, so a long
 * day reads top to bottom instead of in a narrow column. Same week, filters,
 * search and task dialog as the other views; no dragging, since a list has
 * no other day to drop on in view. An empty day is one line, with Add on
 * days still to come.
 */
export function PlannerList({
  days,
  todayIso,
  tasksByDay,
  ghosts,
  appointmentsByDay,
  prepCounts,
  offOn,
  timeOffNotes,
  helpers,
  nowTs,
  offLabel,
  onOpenTask,
  onOpenAppointment,
  onAdd,
}: {
  days: Date[];
  todayIso: string;
  tasksByDay: Map<string, Task[]>;
  ghosts: Map<string, RoutineGhost[]>;
  appointmentsByDay: Map<string, Appointment[]>;
  prepCounts: Map<string, number>;
  /** Short names of helpers whose rest day it is. */
  offOn: (day: Date) => string[];
  timeOffNotes: (dayIso: string) => string[];
  helpers: Helper[];
  nowTs: number;
  offLabel: (task: Task) => string | null;
  onOpenTask?: (task: Task) => void;
  onOpenAppointment?: (appointment: Appointment) => void;
  onAdd: (dayIso: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-border/20">
      {days.map((day) => {
        const iso = toISODate(day);
        const isToday = iso === todayIso;
        const isPast = iso < todayIso;
        const items: Item[] = [
          ...(appointmentsByDay.get(iso) ?? []).map(
            (appointment): Item => ({
              kind: "appointment",
              at: parseTimeToMinutes(appointment.time),
              appointment,
            }),
          ),
          ...(tasksByDay.get(iso) ?? []).map(
            (task): Item => ({ kind: "task", at: parseTimeToMinutes(task.time), task }),
          ),
          ...(ghosts.get(iso) ?? []).map(
            (ghost): Item => ({ kind: "ghost", at: parseTimeToMinutes(ghost.routine.time), ghost }),
          ),
        ].sort((a, b) => a.at - b.at);
        const notes = [
          ...(offOn(day).length > 0 ? [`Day off: ${offOn(day).join(", ")}`] : []),
          ...timeOffNotes(iso),
        ];

        return (
          <section
            key={iso}
            aria-label={`${dayHeading(day)}${isToday ? ", today" : ""}`}
            className="border-b border-border/60 last:border-b-0"
          >
            <header
              className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 ${
                isToday ? "bg-primary/5" : "bg-secondary/30"
              }`}
            >
              <h3
                className={`text-xs font-semibold ${
                  isToday ? "text-primary" : isPast ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                {dayHeading(day)}
                {isToday && " · Today"}
              </h3>
              {notes.map((n) => (
                <span key={n} className="text-xs text-muted-foreground">
                  {n}
                </span>
              ))}
              {items.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  {isPast ? "Nothing was planned" : "Nothing planned"}
                </span>
              )}
              {!isPast && (
                <button
                  type="button"
                  onClick={() => onAdd(iso)}
                  aria-label={`Add a task on ${weekdayOf(day)} ${day.getDate()}`}
                  className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Add
                </button>
              )}
            </header>
            {items.length > 0 && (
              <ul className="divide-y divide-border/60">
                {items.map((item) =>
                  item.kind === "appointment" ? (
                    <PlannerAppointmentRow
                      key={`a-${item.appointment.id}`}
                      appointment={item.appointment}
                      prepCount={prepCounts.get(item.appointment.id) ?? 0}
                      onOpen={
                        onOpenAppointment ? () => onOpenAppointment(item.appointment) : undefined
                      }
                    />
                  ) : item.kind === "task" ? (
                    <PlannerTaskRow
                      key={item.task.id}
                      task={item.task}
                      helpers={helpers}
                      nowTs={nowTs}
                      offLabel={offLabel(item.task)}
                      onOpen={onOpenTask ? () => onOpenTask(item.task) : undefined}
                    />
                  ) : (
                    <RoutineGhostRow
                      key={`g-${item.ghost.routine.id}`}
                      ghost={item.ghost}
                      helpers={helpers}
                    />
                  ),
                )}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
