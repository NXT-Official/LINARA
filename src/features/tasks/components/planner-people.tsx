import { Plus } from "lucide-react";

import type { Appointment } from "@/features/appointments/appointment.types";
import { STATION_HEX, UNASSIGNED_HEX } from "@/features/people/people.constants";
import type { Helper } from "@/features/people/people.types";
import type { HelperSchedule } from "@/features/shifts/shift.types";
import { isRestDay, summarizeSchedule } from "@/features/shifts/shift.utils";
import { toISODate, weekdayOf } from "@/lib/time";

import { cellKey, type RoutineGhost } from "../planner.utils";
import type { Task } from "../task.types";
import {
  PlannerAppointmentRow,
  PlannerTaskRow,
  RoutineGhostRow,
  type PlannerDrag,
} from "./planner-day-column";

/** One row: a helper, or (null) the Unassigned tray. */
export type PeopleRow = { helper: Helper | null };

/**
 * The week by person: a row per helper, a column per day. Her shift sits in
 * the row's label and her day off shades the cell, so a task dropped where
 * she won't be is easy to spot. Dropping on another row hands the task over;
 * the Unassigned row is the tray of tasks nobody has yet.
 */
export function PlannerPeople({
  days,
  todayIso,
  rows,
  tasksByCell,
  ghostsByCell,
  appointmentsByDay,
  prepCounts,
  helpers,
  nowTs,
  scheduleFor,
  outsideShift,
  drag,
  onOpenTask,
  onOpenAppointment,
  onAdd,
}: {
  days: Date[];
  todayIso: string;
  rows: PeopleRow[];
  /** Keyed by cellKey(day, helperId). */
  tasksByCell: Map<string, Task[]>;
  ghostsByCell: Map<string, RoutineGhost[]>;
  appointmentsByDay: Map<string, Appointment[]>;
  prepCounts: Map<string, number>;
  helpers: Helper[];
  nowTs: number;
  scheduleFor: (helperId: string) => HelperSchedule | undefined;
  outsideShift: (task: Task) => boolean;
  drag?: PlannerDrag;
  onOpenTask?: (task: Task) => void;
  onOpenAppointment?: (appointment: Appointment) => void;
  /** Absent for remote admins. */
  onAdd?: (dayIso: string, helperId: string | null) => void;
}) {
  const isos = days.map(toISODate);
  const hasAppointments = isos.some((iso) => (appointmentsByDay.get(iso) ?? []).length > 0);
  const template = { gridTemplateColumns: "8.5rem repeat(7, minmax(8.5rem, 1fr))" };

  return (
    // Seven columns don't fit a phone: the grid scrolls sideways inside its
    // card, with the names pinned on the left.
    <div className="overflow-x-auto rounded-3xl bg-card shadow-soft ring-1 ring-border/20">
      <div className="grid" style={template}>
        <div className="sticky left-0 z-10 border-b border-border/60 bg-card" />
        {days.map((day) => {
          const iso = toISODate(day);
          const isToday = iso === todayIso;
          return (
            <div
              key={iso}
              className="flex items-baseline gap-1.5 border-b border-l border-border/60 px-3 pt-2.5 pb-2"
            >
              <span
                className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}
              >
                {weekdayOf(day)}
              </span>
              <span
                className={`font-display text-lg leading-none tabular-nums ${
                  iso < todayIso ? "text-muted-foreground" : "text-foreground"
                }`}
              >
                {day.getDate()}
              </span>
              {isToday && <span className="ml-auto text-xs font-semibold text-primary">Today</span>}
            </div>
          );
        })}

        {hasAppointments && (
          <>
            <RowLabel title="Appointments" />
            {isos.map((iso) => (
              <div key={iso} className="border-b border-l border-border/60">
                <ul className="divide-y divide-border/60">
                  {(appointmentsByDay.get(iso) ?? []).map((a) => (
                    <PlannerAppointmentRow
                      key={a.id}
                      appointment={a}
                      prepCount={prepCounts.get(a.id) ?? 0}
                      onOpen={onOpenAppointment ? () => onOpenAppointment(a) : undefined}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}

        {rows.map(({ helper }) => {
          const helperId = helper?.id ?? null;
          const schedule = helper ? scheduleFor(helper.id) : undefined;
          const name = helper ? helper.short : "Unassigned";
          const color = helper ? STATION_HEX[helper.station] : UNASSIGNED_HEX;
          return (
            <div key={helperId ?? "unassigned"} className="contents">
              <RowLabel
                title={name}
                dot={color.solid}
                sub={
                  helper
                    ? schedule
                      ? summarizeSchedule(schedule)
                      : "No shift set"
                    : "Nobody has these yet"
                }
              />
              {days.map((day) => {
                const iso = toISODate(day);
                const key = cellKey(iso, helperId);
                const isPast = iso < todayIso;
                const off = !!schedule && isRestDay(weekdayOf(day), schedule);
                const tasks = tasksByCell.get(key) ?? [];
                const ghosts = ghostsByCell.get(key) ?? [];
                const isOver = drag?.overDay === key;
                return (
                  <section
                    key={key}
                    aria-label={`${name}, ${weekdayOf(day)} ${day.getDate()}${off ? ", day off" : ""}`}
                    {...(drag && !isPast ? drag.dropTarget(iso, helperId) : {})}
                    className={`group/cell flex min-h-20 min-w-0 flex-col border-b border-l border-border/60 transition-colors ${
                      isOver
                        ? "bg-primary/10 ring-2 ring-inset ring-primary"
                        : off
                          ? "bg-secondary/40"
                          : isPast
                            ? "bg-secondary/15"
                            : ""
                    }`}
                  >
                    {off && <p className="px-3 pt-2 text-xs text-muted-foreground">Day off</p>}
                    {tasks.length + ghosts.length > 0 && (
                      <ul className="divide-y divide-border/60">
                        {tasks.map((t) => (
                          <PlannerTaskRow
                            key={t.id}
                            task={t}
                            helpers={helpers}
                            nowTs={nowTs}
                            outsideShift={outsideShift(t)}
                            hideWho
                            drag={drag}
                            onOpen={onOpenTask ? () => onOpenTask(t) : undefined}
                          />
                        ))}
                        {ghosts.map((g) => (
                          <RoutineGhostRow key={g.routine.id} ghost={g} helpers={helpers} hideWho />
                        ))}
                      </ul>
                    )}
                    {onAdd && !isPast && (
                      <button
                        type="button"
                        onClick={() => onAdd(iso, helperId)}
                        aria-label={`Add task for ${name} on ${weekdayOf(day)} ${day.getDate()}`}
                        className="mt-auto flex items-center gap-1 px-3 py-2 text-xs font-semibold text-primary opacity-60 transition hover:bg-secondary/50 hover:opacity-100 focus-visible:opacity-100 group-hover/cell:opacity-100"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </button>
                    )}
                  </section>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RowLabel({ title, sub, dot }: { title: string; sub?: string; dot?: string }) {
  return (
    <div className="sticky left-0 z-10 border-b border-border/60 bg-card px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        {dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
        <span className="truncate text-sm font-semibold text-foreground">{title}</span>
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
