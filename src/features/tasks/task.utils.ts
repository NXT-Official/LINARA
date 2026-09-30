import {
  isoToDisplayTime,
  parseTimeToMinutes,
  toISODate,
  weekdayOf,
  type Weekday,
} from "@/lib/time";
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

const startMs = (t: Task): number => {
  const ms = t.scheduledStart ? Date.parse(t.scheduledStart) : Number.NaN;
  return Number.isNaN(ms) ? Number.NaN : ms;
};

/**
 * Orders tasks by their real start, so a carried-over task from Friday sorts
 * before today's and Thursday's sorts after. Falls back to time of day.
 */
export const byStart = (a: Task, b: Task): number => {
  const [x, y] = [startMs(a), startMs(b)];
  if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
};

/**
 * "7:30 PM" for today, "Thu 7:30 PM" within a week either side, "Oct 12,
 * 7:30 PM" beyond that. The board holds every unfinished task whatever its
 * date, so a bare time is ambiguous for anything not today.
 */
export function taskWhen(t: Task, nowTs: number): string {
  const ms = startMs(t);
  if (Number.isNaN(ms)) return t.time;
  const start = new Date(ms);
  const now = new Date(nowTs);
  if (toISODate(start) === toISODate(now)) return t.time;
  const days = Math.abs(ms - nowTs) / 86_400_000;
  if (days < 6.5) return `${weekdayOf(start)} ${t.time}`;
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${t.time}`;
}

/**
 * Scheduled for a later day than today. The Pass is day-by-day: these sit in
 * "Coming up" and count toward none of today's numbers. A task already in
 * progress is today's whatever its date.
 */
export function isLaterThanToday(t: Task, nowTs: number): boolean {
  if (t.status === "in_progress") return false;
  const ms = startMs(t);
  if (Number.isNaN(ms)) return false;
  const tomorrow = new Date(nowTs);
  tomorrow.setHours(24, 0, 0, 0);
  return ms >= tomorrow.getTime();
}

/**
 * Where a moved task used to be, relative to where it is now: just the time
 * when the day didn't change, otherwise the day too ("Thu 6:00 PM", or
 * "Oct 3, 6:00 PM" a week or more away).
 */
export function movedFromLabel(oldIso: string, newIso: string): string {
  const before = new Date(oldIso);
  const after = new Date(newIso);
  const time = isoToDisplayTime(oldIso);
  if (toISODate(before) === toISODate(after)) return time;
  const days = Math.abs(after.getTime() - before.getTime()) / 86_400_000;
  if (days < 6.5) return `${weekdayOf(before)} ${time}`;
  return `${before.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}
