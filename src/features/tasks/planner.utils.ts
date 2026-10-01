// Calendar math for the planner (components/task-planner.tsx). Days here are
// the civil Dates the rest of @/lib/time uses: local midnight, fields reading
// the household's calendar.
import type { HelperSchedule } from "@/features/shifts/shift.types";
import { isMinuteInShift } from "@/features/shifts/shift.utils";
import type { TimeOff } from "@/features/shifts/time-off";
import {
  parseISODate,
  parseTimeToMinutes,
  toHouseholdClock,
  toISODate,
  weekdayOf,
} from "@/lib/time";

import type { Routine, Task } from "./task.types";
import { byStart, routineAssignee, routineMatches } from "./task.utils";

/** Week: a column per day. People: the same week, a row per person. Month: a calendar. */
export type PlanView = "week" | "people" | "month";

export const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** The Monday on or before `d`; weeks run Mon–Sun, like WEEKDAYS. */
export const startOfWeek = (d: Date): Date => addDays(d, -((d.getDay() + 6) % 7));

/**
 * The days a view shows around `anchor`: its Mon–Sun week, or every whole
 * week the anchor's month touches (so the grid starts on a Monday and ends on
 * a Sunday).
 */
export function planDays(view: PlanView, anchor: Date): Date[] {
  const start =
    view !== "month"
      ? startOfWeek(anchor)
      : startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const end =
    view !== "month"
      ? addDays(start, 7)
      : addDays(startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)), 7);
  const days: Date[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** One week or one month earlier (-1) or later (1). A month step lands on the 1st. */
export const stepAnchor = (view: PlanView, anchor: Date, dir: -1 | 1): Date =>
  view !== "month"
    ? addDays(anchor, 7 * dir)
    : new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);

const monthDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "Sep 28 – Oct 4" for a week, "October 2026" for a month. */
export function planLabel(view: PlanView, anchor: Date): string {
  if (view === "month") {
    return anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  const start = startOfWeek(anchor);
  return `${monthDay(start)} – ${monthDay(addDays(start, 6))}`;
}

/** The household day a task is scheduled on, as YYYY-MM-DD. */
export const taskDayIso = (t: Task): string | null =>
  t.scheduledStart ? toISODate(toHouseholdClock(t.scheduledStart)) : null;

/** Tasks by the household day they're scheduled on, each day in time order. */
export function groupByDay(tasks: Task[]): Map<string, Task[]> {
  const byDay = new Map<string, Task[]>();
  for (const t of [...tasks].sort(byStart)) {
    const day = taskDayIso(t);
    if (!day) continue;
    const list = byDay.get(day);
    if (list) list.push(t);
    else byDay.set(day, [t]);
  }
  return byDay;
}

/**
 * Can this task be dragged to another day? Not once it's started or done:
 * that work happened when it happened.
 */
export const isMovable = (t: Task): boolean => t.status === "todo" || t.status === "blocked";

/** The By person drop-target key for one person's day, as PlannerDrag.overDay holds it. */
export const cellKey = (dayIso: string, helperId: string | null) => `${dayIso}|${helperId ?? ""}`;

/**
 * A routine's copy on a day it hasn't spawned yet: shown greyed, not a real
 * task. `helperId` is who it will go to: null (Unassigned) when the routine's
 * helper has approved time off then.
 */
export type RoutineGhost = { routine: Routine; dayIso: string; helperId: string | null };

/**
 * The routines that will spawn on each day after today, by day. Routines only
 * become real tasks when that day starts (useTaskBoard's startNewDay), so a
 * later week would otherwise look emptier than it will be. A day that already
 * has the routine's task, or a helper who has left, gets no copy. One due
 * while its helper has approved time off is shown as Unassigned, as it will spawn.
 */
export function routineGhosts(
  routines: Routine[],
  days: Date[],
  todayIso: string,
  tasks: Task[],
  activeHelperIds: string[],
  timeOff: TimeOff[] = [],
): Map<string, RoutineGhost[]> {
  const spawned = new Set(
    tasks.filter((t) => t.routineId).map((t) => `${t.routineId}|${taskDayIso(t)}`),
  );
  const active = new Set(activeHelperIds);
  const byDay = new Map<string, RoutineGhost[]>();
  for (const day of days) {
    const dayIso = toISODate(day);
    if (dayIso <= todayIso) continue;
    const ghosts = routines
      .filter(
        (r) =>
          active.has(r.helperId) &&
          routineMatches(r, weekdayOf(day)) &&
          !spawned.has(`${r.id}|${dayIso}`),
      )
      .sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time))
      .map((routine) => ({ routine, dayIso, helperId: routineAssignee(routine, dayIso, timeOff) }));
    if (ghosts.length > 0) byDay.set(dayIso, ghosts);
  }
  return byDay;
}

/** Is this assigned task planned outside its helper's shift (or on her day off)? */
export function isOutsideShift(t: Task, schedule: HelperSchedule | undefined): boolean {
  const dayIso = taskDayIso(t);
  if (!t.helperId || !schedule || !dayIso) return false;
  return !isMinuteInShift(parseTimeToMinutes(t.time), weekdayOf(parseISODate(dayIso)), schedule);
}
