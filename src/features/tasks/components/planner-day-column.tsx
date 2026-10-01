import { CalendarClock, Check, GripVertical, Plus, Repeat } from "lucide-react";
import type { DragEvent } from "react";

import type { Appointment } from "@/features/appointments/appointment.types";
import { STATION_HEX, UNASSIGNED_HEX } from "@/features/people/people.constants";
import type { Helper } from "@/features/people/people.types";
import { findHelper } from "@/features/people/people.utils";

import type { Task } from "../task.types";
import { isMovable, taskTone, type RoutineGhost } from "../planner.utils";
import { isPastDue } from "../task.utils";
import { TONE_EDGE } from "./planner-tone";

/** Drag-and-drop wiring the planner hands each day and each task. */
export type PlannerDrag = {
  /** The task being dragged, if any. */
  draggingId: string | null;
  /** The drop target a dragged task is over: a day, or "day|person" on By person. */
  overDay: string | null;
  start: (task: Task, e: DragEvent) => void;
  end: () => void;
  /**
   * Handlers that make an element a drop target for `dayIso`, or {} when it
   * can't be one. With `helperId` (By person), a drop also hands the task to
   * that person; null there means Unassigned.
   */
  dropTarget: (
    dayIso: string,
    helperId?: string | null,
  ) => {
    onDragOver?: (e: DragEvent) => void;
    onDragLeave?: (e: DragEvent) => void;
    onDrop?: (e: DragEvent) => void;
  };
};

/** The one status word a task needs, if any. Pills are for status only. */
function StatusTag({ task, nowTs }: { task: Task; nowTs: number }) {
  if (task.suggested)
    return (
      <span className="rounded-full bg-secondary px-1.5 text-xs font-semibold text-pine-deep">
        Suggested
      </span>
    );
  if (task.status === "done")
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground">
        <Check className="h-3.5 w-3.5" /> Done
      </span>
    );
  if (task.status === "in_progress")
    return (
      <span className="rounded-full bg-accent/20 px-1.5 text-xs font-bold text-accent-foreground">
        Doing
      </span>
    );
  if (task.status === "blocked")
    return <span className="text-xs font-semibold text-terracotta-ink">On hold</span>;
  if (task.queued)
    return (
      <span
        className="text-xs font-semibold text-muted-foreground"
        title="Added after the board closed. Joins the board when the next day starts."
      >
        Queued
      </span>
    );
  if (isPastDue(task, nowTs))
    return (
      <span className="rounded-full bg-[oklch(0.93_0.06_35)] px-1.5 text-xs font-bold text-[oklch(0.42_0.15_35)]">
        Late
      </span>
    );
  return null;
}

export function PlannerTaskRow({
  task,
  helpers,
  nowTs,
  offLabel = null,
  hideWho = false,
  drag,
  onOpen,
}: {
  task: Task;
  helpers: Helper[];
  nowTs: number;
  /** "off shift" or "time off": planned when its helper is off, so doing it then is after-hours work. */
  offLabel?: string | null;
  /** By person already says whose it is. */
  hideWho?: boolean;
  /** Absent: this task can't be dragged (remote view). */
  drag?: PlannerDrag;
  onOpen?: () => void;
}) {
  const helper = findHelper(task.helperId, helpers);
  const color = task.helperId ? STATION_HEX[task.station] : UNASSIGNED_HEX;
  const done = task.status === "done";
  const off = done ? null : offLabel;
  const movable = !!drag && isMovable(task);
  const dragging = drag?.draggingId === task.id;

  const body = (
    <>
      <span className="flex flex-wrap items-center justify-between gap-x-2">
        <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-muted-foreground">
          {task.time}
        </span>
        <StatusTag task={task} nowTs={nowTs} />
      </span>
      <span
        className={`mt-0.5 line-clamp-2 text-sm font-semibold ${
          done ? "text-muted-foreground line-through" : "text-foreground"
        }`}
      >
        {task.title}
      </span>
      {task.appointmentTitle && (
        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-terracotta-ink">
          <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">For {task.appointmentTitle}</span>
        </span>
      )}
      {(!hideWho || off) && (
        <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {!hideWho && (
            <>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color.solid }}
                aria-hidden
              />
              <span className="truncate">{task.helperId ? helper.short : "Unassigned"}</span>
            </>
          )}
          {off && (
            <span className="shrink-0 font-semibold text-terracotta-ink">
              {hideWho ? off.charAt(0).toUpperCase() + off.slice(1) : `· ${off}`}
            </span>
          )}
        </span>
      )}
    </>
  );

  return (
    <li
      draggable={movable}
      onDragStart={movable ? (e) => drag.start(task, e) : undefined}
      onDragEnd={movable ? drag.end : undefined}
      className={`group relative border-l-[3px] transition-opacity ${TONE_EDGE[taskTone(task, nowTs)]} ${
        dragging ? "opacity-40" : ""
      } ${movable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="block w-full px-3 py-2.5 text-left transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:outline-none"
        >
          {body}
        </button>
      ) : (
        <div className="px-3 py-2.5">{body}</div>
      )}
      {movable && (
        <GripVertical
          aria-hidden
          className="pointer-events-none absolute right-1 bottom-2.5 hidden h-4 w-4 text-muted-foreground/60 group-hover:block"
        />
      )}
    </li>
  );
}

/** A routine's copy on a day it hasn't spawned yet. Look only: it isn't a task yet. */
export function RoutineGhostRow({
  ghost,
  helpers,
  hideWho = false,
}: {
  ghost: RoutineGhost;
  helpers: Helper[];
  hideWho?: boolean;
}) {
  const { routine } = ghost;
  return (
    <li
      className="px-3 py-2.5 opacity-70"
      title="From a routine. It becomes a task when the day starts."
    >
      <span className="flex flex-wrap items-center justify-between gap-x-2">
        <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-muted-foreground">
          {routine.time}
        </span>
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground">
          <Repeat className="h-3 w-3" aria-hidden /> Routine
        </span>
      </span>
      <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">
        {routine.title}
      </span>
      {!hideWho && (
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {ghost.helperId ? findHelper(ghost.helperId, helpers).short : "Unassigned"}
        </span>
      )}
      {!ghost.helperId && (
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {findHelper(routine.helperId, helpers).short} is off then
        </span>
      )}
    </li>
  );
}

/** An appointment, and how many prep tasks hang off it. Opens Appointments to edit. */
export function PlannerAppointmentRow({
  appointment: a,
  prepCount,
  onOpen,
}: {
  appointment: Appointment;
  prepCount: number;
  onOpen?: () => void;
}) {
  const body = (
    <>
      <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-terracotta-ink" />
      <span className="min-w-0 text-xs">
        <span className="block font-semibold tabular-nums text-muted-foreground">{a.time}</span>
        <span className="block text-sm text-foreground">{a.title}</span>
        {prepCount > 0 && (
          <span className="block text-muted-foreground">
            {prepCount} prep {prepCount === 1 ? "task" : "tasks"}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-start gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:outline-none"
        >
          {body}
        </button>
      ) : (
        <div className="flex items-start gap-1.5 px-3 py-2.5">{body}</div>
      )}
    </li>
  );
}

/**
 * One day of the week board: who's off, what's fixed (appointments), and the
 * day's tasks in time order. A drop target for tasks dragged from another day.
 */
export function PlannerDayColumn({
  dayIso,
  label,
  weekday,
  isToday,
  isPast,
  tasks,
  ghosts = [],
  appointments,
  prepCounts,
  offToday,
  timeOffNotes = [],
  helpers,
  nowTs,
  offLabel,
  drag,
  onOpenTask,
  onOpenAppointment,
  onAdd,
  className = "",
}: {
  dayIso: string;
  /** "28", the day of the month. */
  label: string;
  /** "Mon". */
  weekday: string;
  isToday: boolean;
  isPast: boolean;
  tasks: Task[];
  /** Routines that will spawn this day. */
  ghosts?: RoutineGhost[];
  appointments: Appointment[];
  /** Prep tasks per appointment id, across the range shown. */
  prepCounts: Map<string, number>;
  /** Short names of helpers whose rest day this is. */
  offToday: string[];
  /** "Rosa off 1:00 PM – 5:00 PM", "Rosa asked off …": time off on this day. */
  timeOffNotes?: string[];
  helpers: Helper[];
  nowTs: number;
  offLabel: (task: Task) => string | null;
  drag?: PlannerDrag;
  onOpenTask?: (task: Task) => void;
  onOpenAppointment?: (appointment: Appointment) => void;
  /** Absent on past days: nothing new gets planned into the past. */
  onAdd?: () => void;
  className?: string;
}) {
  const isOver = drag?.overDay === dayIso;
  const empty = tasks.length === 0 && appointments.length === 0 && ghosts.length === 0;

  return (
    <section
      aria-label={`${weekday} ${label}${isToday ? ", today" : ""}`}
      {...(drag && !isPast ? drag.dropTarget(dayIso) : {})}
      className={`${className} min-w-0 flex-col rounded-2xl bg-card shadow-soft ring-1 transition-shadow ${
        isOver ? "ring-2 ring-primary" : isToday ? "ring-primary/40" : "ring-border/20"
      }`}
    >
      <header className="flex items-baseline gap-2 border-b border-border/60 px-3 pt-2.5 pb-2">
        <span
          className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"}`}
        >
          {weekday}
        </span>
        <span
          className={`font-display text-lg leading-none tabular-nums ${
            isPast ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {label}
        </span>
        {isToday && <span className="ml-auto text-xs font-semibold text-primary">Today</span>}
      </header>

      {offToday.length > 0 && (
        <p className="px-3 pt-2 text-xs text-muted-foreground">Day off: {offToday.join(", ")}</p>
      )}
      {timeOffNotes.map((note) => (
        <p key={note} className="px-3 pt-2 text-xs text-muted-foreground">
          {note}
        </p>
      ))}

      {empty ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          {isPast ? "Nothing was planned." : "Nothing planned yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {appointments.map((a) => (
            <PlannerAppointmentRow
              key={a.id}
              appointment={a}
              prepCount={prepCounts.get(a.id) ?? 0}
              onOpen={onOpenAppointment ? () => onOpenAppointment(a) : undefined}
            />
          ))}
          {tasks.map((t) => (
            <PlannerTaskRow
              key={t.id}
              task={t}
              helpers={helpers}
              nowTs={nowTs}
              offLabel={offLabel(t)}
              drag={drag}
              onOpen={onOpenTask ? () => onOpenTask(t) : undefined}
            />
          ))}
          {ghosts.map((g) => (
            <RoutineGhostRow key={g.routine.id} ghost={g} helpers={helpers} />
          ))}
        </ul>
      )}

      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="mt-auto flex items-center gap-1.5 border-t border-border/60 px-3 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-secondary/50"
        >
          <Plus className="h-3.5 w-3.5" /> Add task
        </button>
      )}
    </section>
  );
}
