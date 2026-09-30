import { isRestDay } from "@/features/shifts/shift.utils";
import type { HelperSchedule } from "@/features/shifts/shift.types";
import { combineDateAndTime, toISODate, weekdayOf, type Weekday } from "@/lib/time";
import type { Recurrence, Routine, Task } from "./task.types";

export function recurrenceLabel(r?: Recurrence): string | null {
  if (!r || r === "none") return null;
  if (r === "daily") return "Daily";
  if (Array.isArray(r) && r.length > 0) return r.join(", ");
  return null;
}

export const routineMatches = (r: Routine, wd: Weekday): boolean => {
  if (r.recurrence === "daily") return true;
  return r.recurrence.includes(wd);
};

// The market run is the one task that carries the grocery list and its budget.
export const isPalengke = (t: Task) => /pal[eé]ngke|marketing run/i.test(t.title);

/** Minutes after a task's planned time before it counts as past due. */
export const PAST_DUE_GRACE_MIN = 30;

/**
 * Still To-do and its planned start (plus the grace period) has gone by.
 * Compares instants, so a task carried over from an earlier day counts and the
 * viewer's time zone doesn't matter. Blocked tasks are their own state.
 */
export function isPastDue(t: Task, nowTs: number): boolean {
  if (t.status !== "todo" || t.queued) return false;
  const start = t.scheduledStart ? Date.parse(t.scheduledStart) : Number.NaN;
  if (Number.isNaN(start)) return false;
  return start + PAST_DUE_GRACE_MIN * 60_000 <= nowTs;
}

/**
 * The same time of day on the helper's next working day after today -- never
 * her rest day. Without a schedule, simply tomorrow.
 */
export function nextWorkdayStart(
  t: Task,
  nowTs: number,
  schedule: HelperSchedule | undefined,
): { iso: string; weekday: Weekday } {
  const day = new Date(nowTs);
  for (let i = 0; i < 7; i++) {
    day.setDate(day.getDate() + 1);
    if (!schedule || !isRestDay(weekdayOf(day), schedule)) break;
  }
  return { iso: combineDateAndTime(toISODate(day), t.time), weekday: weekdayOf(day) };
}
