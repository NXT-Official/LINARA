import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import type { Appointment } from "@/features/appointments/appointment.types";
import type { Helper } from "@/features/people/people.types";
import type { HelperSchedule } from "@/features/shifts/shift.types";
import { isMinuteInShift, isRestDay } from "@/features/shifts/shift.utils";
import {
  combineDateAndTime,
  parseISODate,
  parseTimeToMinutes,
  startOfDayIso,
  toHouseholdClock,
  toISODate,
  weekdayOf,
} from "@/lib/time";

import { usePlannerTasks } from "../hooks/use-planner-tasks";
import {
  addDays,
  groupByDay,
  planDays,
  planLabel,
  stepAnchor,
  taskDayIso,
  type PlanView,
} from "../planner.utils";
import type { Task } from "../task.types";
import { PlannerDayColumn, type PlannerDrag } from "./planner-day-column";
import { PlannerMonth } from "./planner-month";

const VIEW_KEY = "linara.planView";
/** "all", "unassigned", or a helper id. */
type Who = string;

const dayName = (iso: string) =>
  parseISODate(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/**
 * Plan ahead: the week as a board of days, or the month as a calendar. Any
 * task opens to edit; a waiting one can be dragged to another day; any day
 * from today on takes a new task. Reads every task in range, done ones
 * included, so a past day shows what happened.
 */
export function TaskPlanner({
  token,
  nowTs,
  boardTasks,
  helpers,
  activeHelpers,
  appointments,
  scheduleFor,
  onAddOn,
  onOpenTask,
  onMove,
  usePlan = usePlannerTasks,
}: {
  token: string | null;
  nowTs: number;
  /** The board's tasks: when they change, so might the plan. */
  boardTasks: Task[];
  helpers: Helper[];
  activeHelpers: Helper[];
  appointments: Appointment[];
  scheduleFor: (helperId: string) => HelperSchedule | undefined;
  onAddOn: (dayIso: string) => void;
  /** Absent for remote admins, who can look and suggest but not move. */
  onOpenTask?: (task: Task) => void;
  onMove?: (task: Task, scheduledStartIso: string) => Promise<boolean>;
  /** Where the tasks come from. Tests and the dev fixture pass their own. */
  usePlan?: typeof usePlannerTasks;
}) {
  const todayIso = toISODate(toHouseholdClock(nowTs));

  const [view, setView] = useState<PlanView>("week");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (saved === "week" || saved === "month") setView(saved);
    } catch {
      // ignore
    }
  }, []);
  const changeView = (v: PlanView) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // ignore
    }
  };

  const [anchor, setAnchor] = useState(() => parseISODate(todayIso));
  const [who, setWho] = useState<Who>("all");
  // Phones stack the week, so days already gone would push today off screen.
  const [showEarlier, setShowEarlier] = useState(false);

  const days = useMemo(() => planDays(view, anchor), [view, anchor]);
  const fromIso = startOfDayIso(days[0]);
  const toIso = startOfDayIso(addDays(days[days.length - 1], 1));
  const { tasks, moveLocally, reload } = usePlan({
    token,
    fromIso,
    toIso,
    helpers,
    boardTasks,
  });

  const shown = useMemo(
    () =>
      (tasks ?? []).filter((t) =>
        who === "all" ? true : who === "unassigned" ? t.helperId === null : t.helperId === who,
      ),
    [tasks, who],
  );
  const tasksByDay = useMemo(() => groupByDay(shown), [shown]);
  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) map.set(a.date, [...(map.get(a.date) ?? []), a]);
    for (const list of map.values())
      list.sort((x, y) => parseTimeToMinutes(x.time) - parseTimeToMinutes(y.time));
    return map;
  }, [appointments]);

  // ----- Moving a task to another day -----
  const move = async (task: Task, dayIso: string) => {
    if (!onMove) return;
    const fromDay = taskDayIso(task);
    if (!fromDay || fromDay === dayIso) return;
    const startIso = combineDateAndTime(dayIso, task.time);
    moveLocally(task.id, startIso);
    const saved = await onMove(task, startIso);
    if (!saved) {
      reload();
      return;
    }
    const assignee = activeHelpers.find((h) => h.id === task.helperId);
    const schedule = task.helperId ? scheduleFor(task.helperId) : undefined;
    const outside =
      schedule &&
      !isMinuteInShift(parseTimeToMinutes(task.time), weekdayOf(parseISODate(dayIso)), schedule);
    toast.success(`Moved "${task.title}" to ${dayName(dayIso)}`, {
      description: outside
        ? `That's outside ${assignee?.short ?? "her"}'s shift. Doing it then counts as after-hours work.`
        : undefined,
      action: {
        label: "Undo",
        onClick: () => void move({ ...task, scheduledStart: startIso }, fromDay),
      },
    });
  };

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<string | null>(null);
  const dragged = useRef<Task | null>(null);
  const drag: PlannerDrag | undefined = onMove
    ? {
        draggingId,
        overDay,
        start: (task: Task, e: DragEvent) => {
          dragged.current = task;
          e.dataTransfer.effectAllowed = "move";
          // Firefox won't start a drag without data.
          e.dataTransfer.setData("text/plain", task.title);
          setDraggingId(task.id);
        },
        end: () => {
          dragged.current = null;
          setDraggingId(null);
          setOverDay(null);
        },
        dropTarget: (dayIso: string) => ({
          onDragOver: (e: DragEvent) => {
            if (!dragged.current) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (overDay !== dayIso) setOverDay(dayIso);
          },
          onDragLeave: (e: DragEvent) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setOverDay((d) => (d === dayIso ? null : d));
          },
          onDrop: (e: DragEvent) => {
            e.preventDefault();
            const task = dragged.current;
            dragged.current = null;
            setDraggingId(null);
            setOverDay(null);
            if (task) void move(task, dayIso);
          },
        }),
      }
    : undefined;

  const offOn = (day: Date) =>
    activeHelpers
      .filter((h) => (who === "all" || who === h.id) && scheduleFor(h.id))
      .filter((h) => isRestDay(weekdayOf(day), scheduleFor(h.id)!))
      .map((h) => h.short);

  const showingThisPeriod = days.some((d) => toISODate(d) === todayIso);

  return (
    <section className="space-y-3" aria-labelledby="plan-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <h2 id="plan-heading" className="font-display text-xl text-foreground">
            Plan ahead
          </h2>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground" aria-live="polite">
            {planLabel(view, anchor)}
            {tasks === null && (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Loading" />
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="plan-who">
            Whose tasks
          </label>
          <select
            id="plan-who"
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="all">Everyone</option>
            {activeHelpers.map((h) => (
              <option key={h.id} value={h.id}>
                {h.short}
              </option>
            ))}
            <option value="unassigned">Unassigned</option>
          </select>

          <div
            className="inline-flex rounded-lg border border-border bg-card p-0.5"
            role="group"
            aria-label="Plan view"
          >
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => changeView(v)}
                aria-pressed={view === v}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  view === v
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center rounded-lg border border-border bg-card">
            <button
              type="button"
              onClick={() => setAnchor((a) => stepAnchor(view, a, -1))}
              aria-label={view === "week" ? "Previous week" : "Previous month"}
              className="grid h-9 w-9 place-items-center rounded-l-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchor(parseISODate(todayIso))}
              disabled={showingThisPeriod}
              className="h-9 border-x border-border px-3 text-xs font-semibold text-foreground hover:bg-secondary/60 disabled:text-muted-foreground disabled:hover:bg-transparent"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setAnchor((a) => stepAnchor(view, a, 1))}
              aria-label={view === "week" ? "Next week" : "Next month"}
              className="grid h-9 w-9 place-items-center rounded-r-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {drag && view === "week" && (
        <p className="hidden px-1 text-sm text-muted-foreground lg:block">
          Drag a task to another day to move it. Tap one to change anything else.
        </p>
      )}

      {view === "week" ? (
        <div className="grid gap-3 lg:grid-cols-7 lg:gap-2">
          {!showEarlier && days.some((d) => toISODate(d) < todayIso) && (
            <button
              type="button"
              onClick={() => setShowEarlier(true)}
              className="rounded-2xl border border-dashed border-border px-3 py-2.5 text-left text-sm font-semibold text-primary hover:bg-secondary/50 lg:hidden"
            >
              Show earlier days ({days.filter((d) => toISODate(d) < todayIso).length})
            </button>
          )}
          {days.map((day) => {
            const iso = toISODate(day);
            const isPast = iso < todayIso;
            return (
              <PlannerDayColumn
                key={iso}
                dayIso={iso}
                label={String(day.getDate())}
                weekday={weekdayOf(day)}
                isToday={iso === todayIso}
                isPast={isPast}
                tasks={tasksByDay.get(iso) ?? []}
                appointments={who === "all" ? (appointmentsByDay.get(iso) ?? []) : []}
                offToday={offOn(day)}
                helpers={helpers}
                nowTs={nowTs}
                drag={drag}
                onOpenTask={onOpenTask}
                onAdd={isPast ? undefined : () => onAddOn(iso)}
                className={isPast && !showEarlier ? "hidden lg:flex" : "flex"}
              />
            );
          })}
        </div>
      ) : (
        <PlannerMonth
          days={days}
          month={anchor.getMonth()}
          todayIso={todayIso}
          tasksByDay={tasksByDay}
          appointmentsByDay={who === "all" ? appointmentsByDay : new Map()}
          drag={drag}
          onOpenDay={(day) => {
            setAnchor(day);
            changeView("week");
          }}
        />
      )}
    </section>
  );
}
