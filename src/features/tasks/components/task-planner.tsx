import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { ListFilter } from "@/components/shared/list-filter";
import type { Appointment } from "@/features/appointments/appointment.types";
import type { Helper } from "@/features/people/people.types";
import { findHelper } from "@/features/people/people.utils";
import { HelperPicker } from "@/features/teams/components/helper-picker";
import { useStaffScope } from "@/features/teams/hooks/use-staff-scope";
import { useTeamView } from "@/features/teams/hooks/use-team-view";
import type { HelperSchedule } from "@/features/shifts/shift.types";
import { isRestDay } from "@/features/shifts/shift.utils";
import {
  approvedTimeOffAt,
  timeOffOn,
  describeTimeOff,
  type TimeOff,
} from "@/features/shifts/time-off";
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
import { useTaskSearch } from "../hooks/use-task-search";
import {
  addDays,
  cellKey,
  groupByDay,
  isOutsideShift,
  matchesPlanStatus,
  PLAN_STATUSES,
  planDays,
  planLabel,
  routineGhosts,
  stepAnchor,
  taskDayIso,
  type PlanStatus,
  type PlanView,
  type RoutineGhost,
} from "../planner.utils";
import type { Routine, Task } from "../task.types";
import { PlannerDayColumn, type PlannerDrag } from "./planner-day-column";
import { PlannerMonth } from "./planner-month";
import { TaskToneLegend } from "./planner-tone-legend";
import { PlannerList } from "./planner-list";
import { PlannerPeople, type PeopleRow } from "./planner-people";
import { PlannerSearchResults } from "./planner-search-results";

const VIEW_KEY = "linara.planView";
const VIEWS: { key: PlanView; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "people", label: "By person" },
  { key: "list", label: "List" },
  { key: "month", label: "Month" },
];
/** "all", "unassigned", a helper id, or "team:<id>" for everyone on a team. */
type Who = string;
const TEAM_PREFIX = "team:";
const STATUS_CHIPS: { key: PlanStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "open", label: "To do" },
  { key: "done", label: "Done" },
  { key: "cancelled", label: "Cancelled" },
];

const dayName = (iso: string) =>
  parseISODate(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

// A stable empty list, so the memos below don't recompute every render.
const NO_TIME_OFF: TimeOff[] = [];

/**
 * Plan ahead: the week as a board of days, the same week as a row per person
 * or as a plain list, or the month as a calendar. Any task opens to edit; a waiting one can be
 * dragged to another day (or, by person, to someone else); any day from today
 * on takes a new task. Reads every task in range, done ones included, so a
 * past day shows what happened, and shows the routines later days will spawn.
 *
 * The status chips narrow whichever view is showing. Typing in the search box
 * looks through every date instead (KNOWN_GAPS.md O32), and the results
 * stand in for the calendar until it's cleared.
 */
export function TaskPlanner({
  token,
  nowTs,
  boardTasks,
  routines = [],
  helpers,
  activeHelpers,
  appointments,
  scheduleFor,
  timeOff = NO_TIME_OFF,
  initialDay,
  onAddOn,
  onOpenTask,
  onOpenAppointment,
  onMove,
  usePlan = usePlannerTasks,
  useSearch = useTaskSearch,
}: {
  token: string | null;
  nowTs: number;
  /** The board's tasks: when they change, so might the plan. */
  boardTasks: Task[];
  /** Routine templates: shown greyed on the later days they will spawn. */
  routines?: Routine[];
  helpers: Helper[];
  activeHelpers: Helper[];
  appointments: Appointment[];
  scheduleFor: (helperId: string) => HelperSchedule | undefined;
  /** Rest off (and later leave), approved and asked for (KNOWN_GAPS O19). */
  timeOff?: TimeOff[];
  /** YYYY-MM-DD to open on (a "Coming up" link from the Pass). Defaults to today. */
  initialDay?: string;
  /** A day to add on, and on By person, whose row it was (null = Unassigned). */
  onAddOn: (dayIso: string, helperId?: string | null) => void;
  /** Absent for remote admins, who can look and suggest but not move. */
  onOpenTask?: (task: Task) => void;
  onOpenAppointment?: (appointment: Appointment) => void;
  onMove?: (task: Task, scheduledStartIso: string, helperId: string | null) => Promise<boolean>;
  /** Where the tasks come from. Tests and the dev fixture pass their own. */
  usePlan?: typeof usePlannerTasks;
  /** Where search results come from; tests pass their own. */
  useSearch?: typeof useTaskSearch;
}) {
  const todayIso = toISODate(toHouseholdClock(nowTs));

  const [view, setView] = useState<PlanView>("week");
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(VIEW_KEY);
      if (VIEWS.some((v) => v.key === saved)) setView(saved as PlanView);
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

  const [anchor, setAnchor] = useState(() => parseISODate(initialDay ?? todayIso));
  useEffect(() => {
    if (initialDay) setAnchor(parseISODate(initialDay));
  }, [initialDay]);
  const [who, setWho] = useState<Who>("all");
  const [status, setStatus] = useState<PlanStatus>("all");
  const [query, setQuery] = useState("");
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

  const { teams } = useTeamView();
  const groupStaff = useStaffScope().group;
  const whoTeam = who.startsWith(TEAM_PREFIX) ? who.slice(TEAM_PREFIX.length) : null;
  const matchesWho = useCallback(
    (helperId: string | null) =>
      who === "all"
        ? true
        : who === "unassigned"
          ? helperId === null
          : whoTeam
            ? helperId !== null && findHelper(helperId, helpers).teamId === whoTeam
            : helperId === who,
    [who, whoTeam, helpers],
  );
  const teamMemberIds = useMemo(
    () => (whoTeam ? helpers.filter((h) => h.teamId === whoTeam).map((h) => h.id) : undefined),
    [whoTeam, helpers],
  );
  const shown = useMemo(
    () => (tasks ?? []).filter((t) => matchesWho(t.helperId) && matchesPlanStatus(t, status)),
    [tasks, matchesWho, status],
  );
  const search = useSearch({
    token,
    query,
    helper: whoTeam ? "all" : who,
    helperIds: teamMemberIds,
    statuses: PLAN_STATUSES[status],
    helpers,
    boardTasks,
  });
  const tasksByDay = useMemo(() => groupByDay(shown), [shown]);
  const appointmentsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) map.set(a.date, [...(map.get(a.date) ?? []), a]);
    for (const list of map.values())
      list.sort((x, y) => parseTimeToMinutes(x.time) - parseTimeToMinutes(y.time));
    return map;
  }, [appointments]);
  // Prep tasks can fall on the day before their appointment, so count across the range.
  const prepCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks ?? [])
      if (t.appointmentId) map.set(t.appointmentId, (map.get(t.appointmentId) ?? 0) + 1);
    return map;
  }, [tasks]);
  // Filtered by who each copy will go to, which time off can make Unassigned.
  // A copy is a task to come, so the Done and Cancelled chips hide them.
  const showGhosts = status === "all" || status === "open";
  const ghosts = useMemo(() => {
    if (!showGhosts) return new Map<string, RoutineGhost[]>();
    const all = routineGhosts(
      routines,
      days,
      todayIso,
      tasks ?? [],
      activeHelpers.map((h) => h.id),
      timeOff,
    );
    const out = new Map<string, RoutineGhost[]>();
    for (const [day, list] of all) {
      const mine = list.filter((g) => matchesWho(g.helperId));
      if (mine.length > 0) out.set(day, mine);
    }
    return out;
  }, [routines, days, todayIso, tasks, activeHelpers, timeOff, matchesWho, showGhosts]);

  /** Why a task's time is one its helper has off, if it is. */
  const offLabel = (t: Task): string | null => {
    const day = taskDayIso(t);
    if (!t.helperId || !day) return null;
    if (approvedTimeOffAt(timeOff, t.helperId, day, parseTimeToMinutes(t.time))) return "time off";
    return isOutsideShift(t, scheduleFor(t.helperId)) ? "off shift" : null;
  };

  // ----- Moving a task to another day, or (by person) to someone else -----
  const move = async (task: Task, dayIso: string, helperId: string | null) => {
    if (!onMove) return;
    const fromDay = taskDayIso(task);
    if (!fromDay || (fromDay === dayIso && helperId === task.helperId)) return;
    const startIso = combineDateAndTime(dayIso, task.time);
    const handedOver = helperId !== task.helperId;
    moveLocally(task.id, startIso, handedOver ? helperId : undefined);
    const saved = await onMove(task, startIso, helperId);
    if (!saved) {
      reload();
      return;
    }
    const assignee = helperId ? findHelper(helperId, helpers) : null;
    const off = offLabel({ ...task, helperId, scheduledStart: startIso });
    const where = [
      handedOver ? (assignee ? `to ${assignee.short}` : "to Unassigned") : null,
      fromDay !== dayIso ? `${handedOver ? "on" : "to"} ${dayName(dayIso)}` : null,
    ]
      .filter(Boolean)
      .join(" ");
    toast.success(`Moved "${task.title}" ${where}`, {
      description: off
        ? `That's ${off === "time off" ? "in" : "outside"} ${assignee?.short ?? "the helper"}'s ${off === "time off" ? "time off" : "shift"}. Doing it then counts as after-hours work.`
        : undefined,
      action: {
        label: "Undo",
        onClick: () =>
          void move({ ...task, scheduledStart: startIso, helperId }, fromDay, task.helperId),
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
        dropTarget: (dayIso: string, helperId?: string | null) => {
          const key = helperId === undefined ? dayIso : cellKey(dayIso, helperId);
          return {
            onDragOver: (e: DragEvent) => {
              if (!dragged.current) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (overDay !== key) setOverDay(key);
            },
            onDragLeave: (e: DragEvent) => {
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setOverDay((d) => (d === key ? null : d));
            },
            onDrop: (e: DragEvent) => {
              e.preventDefault();
              const task = dragged.current;
              dragged.current = null;
              setDraggingId(null);
              setOverDay(null);
              if (task) void move(task, dayIso, helperId === undefined ? task.helperId : helperId);
            },
          };
        },
      }
    : undefined;

  const timeOffNotes = (dayIso: string) =>
    timeOffOn(timeOff, dayIso)
      .filter((o) => matchesWho(o.helperId))
      .map((o) => describeTimeOff(o, findHelper(o.helperId, helpers).short));

  const offOn = (day: Date) =>
    activeHelpers
      .filter((h) => matchesWho(h.id) && scheduleFor(h.id))
      .filter((h) => isRestDay(weekdayOf(day), scheduleFor(h.id)!))
      .map((h) => h.short);

  // ----- By person -----
  const peopleRows = useMemo((): PeopleRow[] => {
    // Anyone with a task this week gets a row, even someone who has since left.
    const ids = new Set(activeHelpers.map((h) => h.id));
    const former = [...new Set(shown.map((t) => t.helperId))]
      .filter((id): id is string => !!id && !ids.has(id))
      .map((id) => findHelper(id, helpers));
    const everyone = [...activeHelpers, ...former].filter((h) => matchesWho(h.id));
    // With teams, rows sit under their team's name.
    const groups = groupStaff(everyone);
    return [
      ...(matchesWho(null) ? [{ helper: null }] : []),
      ...(groups
        ? groups.flatMap((g): PeopleRow[] => [
            { heading: g.title, count: g.items.length },
            ...g.items.map((helper) => ({ helper })),
          ])
        : everyone.map((helper) => ({ helper }))),
    ];
  }, [activeHelpers, helpers, shown, matchesWho, groupStaff]);
  const tasksByCell = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const [day, list] of tasksByDay)
      for (const t of list) {
        const key = cellKey(day, t.helperId);
        map.set(key, [...(map.get(key) ?? []), t]);
      }
    return map;
  }, [tasksByDay]);
  const ghostsByCell = useMemo(() => {
    const map = new Map<string, RoutineGhost[]>();
    for (const [day, list] of ghosts)
      for (const g of list) {
        const key = cellKey(day, g.helperId);
        map.set(key, [...(map.get(key) ?? []), g]);
      }
    return map;
  }, [ghosts]);

  const showingThisPeriod = days.some((d) => toISODate(d) === todayIso);
  // Appointments aren't anyone's task, nor done or cancelled: only on the unfiltered plan.
  const appointmentsShown =
    who === "all" && status === "all" ? appointmentsByDay : new Map<string, Appointment[]>();

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
          <div className="min-w-[9rem]">
            <HelperPicker
              helpers={activeHelpers}
              value={who}
              onChange={setWho}
              ariaLabel="Whose tasks"
              before={[
                { value: "all", label: "Everyone" },
                ...teams.teams.map((t) => ({
                  value: `${TEAM_PREFIX}${t.id}`,
                  label: `All of ${t.name}`,
                })),
              ]}
              after={[{ value: "unassigned", label: "Unassigned" }]}
              describe={(h) => h.short}
              className="h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>

          <div
            className="inline-flex rounded-lg border border-border bg-card p-0.5"
            role="group"
            aria-label="Plan view"
          >
            {VIEWS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => changeView(key)}
                aria-pressed={view === key}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  view === key
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center rounded-lg border border-border bg-card">
            <button
              type="button"
              onClick={() => setAnchor((a) => stepAnchor(view, a, -1))}
              aria-label={view === "month" ? "Previous month" : "Previous week"}
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
              aria-label={view === "month" ? "Next month" : "Next week"}
              className="grid h-9 w-9 place-items-center rounded-r-lg text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-1">
        <ListFilter
          query={query}
          onQuery={setQuery}
          chips={STATUS_CHIPS}
          active={status}
          onChip={setStatus}
          label="Search tasks on every date"
        />
      </div>

      {search.active ? (
        <PlannerSearchResults
          query={query}
          tasks={search.tasks}
          helpers={helpers}
          nowTs={nowTs}
          onOpenTask={onOpenTask}
          onShowDay={(day) => {
            setQuery("");
            setAnchor(parseISODate(day));
            changeView("week");
            setShowEarlier(true);
          }}
        />
      ) : (
        <>
          {drag && (view === "week" || view === "people") && (
            <p className="hidden px-1 text-sm text-muted-foreground lg:block">
              {view === "people"
                ? "Drag a task to another day, or to someone else's row to hand it over. Tap one to change anything else."
                : "Drag a task to another day to move it. Tap one to change anything else."}
            </p>
          )}

          <TaskToneLegend />

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
                    ghosts={ghosts.get(iso)}
                    appointments={appointmentsShown.get(iso) ?? []}
                    prepCounts={prepCounts}
                    offToday={offOn(day)}
                    timeOffNotes={timeOffNotes(iso)}
                    helpers={helpers}
                    nowTs={nowTs}
                    offLabel={offLabel}
                    drag={drag}
                    onOpenTask={onOpenTask}
                    onOpenAppointment={onOpenAppointment}
                    onAdd={isPast ? undefined : () => onAddOn(iso)}
                    className={isPast && !showEarlier ? "hidden lg:flex" : "flex"}
                  />
                );
              })}
            </div>
          ) : view === "people" ? (
            <PlannerPeople
              days={days}
              todayIso={todayIso}
              rows={peopleRows}
              tasksByCell={tasksByCell}
              ghostsByCell={ghostsByCell}
              appointmentsByDay={appointmentsShown}
              prepCounts={prepCounts}
              helpers={helpers}
              nowTs={nowTs}
              scheduleFor={scheduleFor}
              timeOff={timeOff.filter((o) => matchesWho(o.helperId))}
              offLabel={offLabel}
              drag={drag}
              onOpenTask={onOpenTask}
              onOpenAppointment={onOpenAppointment}
              onAdd={onAddOn}
            />
          ) : view === "list" ? (
            <PlannerList
              days={days}
              todayIso={todayIso}
              tasksByDay={tasksByDay}
              ghosts={ghosts}
              appointmentsByDay={appointmentsShown}
              prepCounts={prepCounts}
              offOn={offOn}
              timeOffNotes={timeOffNotes}
              helpers={helpers}
              nowTs={nowTs}
              offLabel={offLabel}
              onOpenTask={onOpenTask}
              onOpenAppointment={onOpenAppointment}
              onAdd={(iso) => onAddOn(iso)}
            />
          ) : (
            <PlannerMonth
              days={days}
              month={anchor.getMonth()}
              todayIso={todayIso}
              nowTs={nowTs}
              tasksByDay={tasksByDay}
              appointmentsByDay={appointmentsShown}
              drag={drag}
              onOpenDay={(day) => {
                setAnchor(day);
                changeView("week");
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
