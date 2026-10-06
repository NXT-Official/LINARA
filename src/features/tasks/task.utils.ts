import { approvedTimeOffAt, type TimeOff } from "@/features/shifts/time-off";
import {
  formatDisplayTime,
  fromHouseholdClock,
  isoToDisplayTime,
  parseTimeToMinutes,
  toHouseholdClock,
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

/**
 * Who a routine's task goes to on a day: its helper, or no one (Unassigned)
 * when she has approved time off at its time (leave, or a rest-off window).
 * The work still needs doing, so it lands where a manager will hand it on
 * rather than on the phone of someone who's away (LEAVE_PLAN.md step 4).
 */
export const routineAssignee = (r: Routine, dayIso: string, timeOff: TimeOff[]): string | null =>
  approvedTimeOffAt(timeOff, r.helperId, dayIso, parseTimeToMinutes(r.time)) ? null : r.helperId;

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
/** The lengths offered for a task, in minutes. */
export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480];

/** "45 min", "1 hr", "1 hr 30 min". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

/** "2:00 PM – 3:30 PM" for a task with a length; just its time without one. */
export function timeSpan(t: Pick<Task, "time" | "durationMinutes">): string {
  if (!t.durationMinutes) return t.time;
  const end = (parseTimeToMinutes(t.time) + t.durationMinutes) % (24 * 60);
  return `${t.time} – ${formatDisplayTime(end)}`;
}

export function taskWhen(t: Task, nowTs: number): string {
  const ms = startMs(t);
  if (Number.isNaN(ms)) return timeSpan(t);
  const start = toHouseholdClock(ms);
  const now = toHouseholdClock(nowTs);
  if (toISODate(start) === toISODate(now)) return timeSpan(t);
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
  const today = toHouseholdClock(nowTs);
  const tomorrow = fromHouseholdClock(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate() + 1,
  );
  return ms >= tomorrow.getTime();
}

/**
 * Where a moved task used to be, relative to where it is now: just the time
 * when the day didn't change, otherwise the day too ("Thu 6:00 PM", or
 * "Oct 3, 6:00 PM" a week or more away).
 */
export function movedFromLabel(oldIso: string, newIso: string): string {
  const before = toHouseholdClock(oldIso);
  const after = toHouseholdClock(newIso);
  const time = isoToDisplayTime(oldIso);
  if (toISODate(before) === toISODate(after)) return time;
  const days = Math.abs(after.getTime() - before.getTime()) / 86_400_000;
  if (days < 6.5) return `${weekdayOf(before)} ${time}`;
  return `${before.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
}

/**
 * What's missing from a new or edited task, per field; empty when it can be
 * saved. Shown under each field once Save is pressed (QA, 2026-10-02: an
 * empty title just left the dialog sitting there).
 */
export function taskFormErrors(form: {
  title: string;
  date: string;
  time: string;
}): Partial<Record<"title" | "date" | "time", string>> {
  const errors: Partial<Record<"title" | "date" | "time", string>> = {};
  if (!form.title.trim()) errors.title = "Give the task a name.";
  if (!form.date) errors.date = "Pick a day.";
  if (!form.time) errors.time = "Pick a time.";
  return errors;
}
