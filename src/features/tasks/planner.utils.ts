// Calendar math for the planner (components/task-planner.tsx). Days here are
// the civil Dates the rest of @/lib/time uses: local midnight, fields reading
// the household's calendar.
import { toHouseholdClock, toISODate } from "@/lib/time";

import type { Task } from "./task.types";
import { byStart } from "./task.utils";

export type PlanView = "week" | "month";

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
    view === "week"
      ? startOfWeek(anchor)
      : startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const end =
    view === "week"
      ? addDays(start, 7)
      : addDays(startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)), 7);
  const days: Date[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** One week or one month earlier (-1) or later (1). A month step lands on the 1st. */
export const stepAnchor = (view: PlanView, anchor: Date, dir: -1 | 1): Date =>
  view === "week"
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
