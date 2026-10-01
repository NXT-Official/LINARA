import { CalendarClock, Check, GripVertical, Plus } from "lucide-react";
import type { DragEvent } from "react";

import type { Appointment } from "@/features/appointments/appointment.types";
import { STATION_HEX, UNASSIGNED_HEX } from "@/features/people/people.constants";
import type { Helper } from "@/features/people/people.types";
import { findHelper } from "@/features/people/people.utils";

import type { Task } from "../task.types";
import { isMovable } from "../planner.utils";
import { isPastDue } from "../task.utils";

/** Drag-and-drop wiring the planner hands each day and each task. */
export type PlannerDrag = {
  /** The task being dragged, if any. */
  draggingId: string | null;
  /** The day a dragged task is currently over. */
  overDay: string | null;
  start: (task: Task, e: DragEvent) => void;
  end: () => void;
  /** Handlers that make an element a drop target for `dayIso`, or {} when it can't be one. */
  dropTarget: (dayIso: string) => {
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
    return <span className="text-xs font-semibold text-muted-foreground">Queued</span>;
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
  drag,
  onOpen,
}: {
  task: Task;
  helpers: Helper[];
  nowTs: number;
  /** Absent: this task can't be dragged (remote view). */
  drag?: PlannerDrag;
  onOpen?: () => void;
}) {
  const helper = findHelper(task.helperId, helpers);
  const color = task.helperId ? STATION_HEX[task.station] : UNASSIGNED_HEX;
  const done = task.status === "done";
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
      <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color.solid }}
          aria-hidden
        />
        <span className="truncate">{task.helperId ? helper.short : "Unassigned"}</span>
      </span>
    </>
  );

  return (
    <li
      draggable={movable}
      onDragStart={movable ? (e) => drag.start(task, e) : undefined}
      onDragEnd={movable ? drag.end : undefined}
      className={`group relative transition-opacity ${dragging ? "opacity-40" : ""} ${
        movable ? "cursor-grab active:cursor-grabbing" : ""
      }`}
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
  appointments,
  offToday,
  helpers,
  nowTs,
  drag,
  onOpenTask,
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
  appointments: Appointment[];
  /** Short names of helpers whose rest day this is. */
  offToday: string[];
  helpers: Helper[];
  nowTs: number;
  drag?: PlannerDrag;
  onOpenTask?: (task: Task) => void;
  /** Absent on past days: nothing new gets planned into the past. */
  onAdd?: () => void;
  className?: string;
}) {
  const isOver = drag?.overDay === dayIso;
  const empty = tasks.length === 0 && appointments.length === 0;

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

      {empty ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">
          {isPast ? "Nothing was planned." : "Nothing planned yet."}
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {appointments.map((a) => (
            <li key={a.id} className="flex items-start gap-1.5 px-3 py-2.5">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-terracotta-ink" />
              <span className="min-w-0 text-xs">
                <span className="block font-semibold tabular-nums text-muted-foreground">
                  {a.time}
                </span>
                <span className="block text-sm text-foreground">{a.title}</span>
              </span>
            </li>
          ))}
          {tasks.map((t) => (
            <PlannerTaskRow
              key={t.id}
              task={t}
              helpers={helpers}
              nowTs={nowTs}
              drag={drag}
              onOpen={onOpenTask ? () => onOpenTask(t) : undefined}
            />
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
