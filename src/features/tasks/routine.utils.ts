// Repeating tasks (KNOWN_GAPS.md O43). A repeating task is a series of
// ordinary tickets: routine_id names the series (the id of its first task),
// and its newest task is the pattern for the next day's. Once
// supabase/add-repeating-tasks.sql is applied the database makes each day's
// task itself (spawn_routine_tasks); this is the web's reading of a series
// (the Routines list, the planner's greyed copies) and its stand-in for the
// spawn until then. The two follow the same rules; keep them in step.
import type { Helper } from "@/features/people/people.types";
import { findHelper } from "@/features/people/people.utils";
import { placeFromColumns } from "@/features/sharing/sharing.utils";
import type { TimeOff } from "@/features/shifts/time-off";
import {
  isoToDisplayTime,
  isoToISODate,
  parseISODate,
  parseTimeToMinutes,
  toISODate,
  weekdayOf,
} from "@/lib/time";

import type { TicketRow } from "./task.actions";
import type { Recurrence, Routine } from "./task.types";
import { decodeRecurrence, routineAssignee, routineMatches } from "./task.utils";

/** The columns a series is read from (a subset of TicketRow). */
export type SeriesRow = Pick<
  TicketRow,
  | "id"
  | "title"
  | "notes"
  | "helper_id"
  | "scheduled_start"
  | "recurrence"
  | "routine_id"
  | "suggested"
  | "duration_minutes"
  | "from_household_id"
  | "from_place_id"
  | "to_household_id"
  | "to_place_id"
> & { occurrence_date?: string | null };

/** The series a ticket is in: its routine_id, or its own id when it's the first of one from before routine_id was set. */
export const seriesOf = (row: Pick<SeriesRow, "id" | "routine_id">): string =>
  row.routine_id ?? row.id;

/** The household day a ticket is for: occurrence_date once the SQL is applied, else the day it's scheduled on. */
export const occurrenceDay = (row: Pick<SeriesRow, "occurrence_date" | "scheduled_start">) =>
  row.occurrence_date ?? isoToISODate(row.scheduled_start);

/** Newest first: the later day, then the later start. */
const newerFirst = (a: SeriesRow, b: SeriesRow): number => {
  const [da, db] = [occurrenceDay(a), occurrenceDay(b)];
  if (da !== db) return da < db ? 1 : -1;
  return Date.parse(b.scheduled_start) - Date.parse(a.scheduled_start);
};

/**
 * The household's live repeating tasks, one per series, earliest in the day
 * first. A series whose newest task no longer repeats has been stopped; one
 * whose newest is a remote admin's suggestion waits for approval. Neither is
 * listed.
 */
export function routinesFromTickets(rows: SeriesRow[], helpers: Helper[]): Routine[] {
  const bySeries = new Map<string, SeriesRow[]>();
  for (const row of rows) {
    const key = seriesOf(row);
    bySeries.set(key, [...(bySeries.get(key) ?? []), row]);
  }
  const routines: Routine[] = [];
  for (const [id, list] of bySeries) {
    list.sort(newerFirst);
    const newest = list[0];
    const recurrence = decodeRecurrence(newest.recurrence);
    if (!recurrence || recurrence === "none" || newest.suggested) continue;
    // A day spawned Unassigned (she was away) doesn't make the series Unassigned.
    const helperId = list.find((r) => r.helper_id)?.helper_id ?? null;
    routines.push({
      id,
      title: newest.title,
      note: newest.notes ?? undefined,
      helperId,
      station: findHelper(helperId, helpers).station,
      time: isoToDisplayTime(newest.scheduled_start),
      recurrence,
      durationMinutes: newest.duration_minutes ?? undefined,
      from: placeFromColumns(newest.from_household_id, newest.from_place_id),
      to: placeFromColumns(newest.to_household_id, newest.to_place_id),
      lastDay: occurrenceDay(newest),
    });
  }
  return routines.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
}

/** A routine's task to make on a day, and who it goes to then. */
export type DueRoutine = { routine: Routine; helperId: string | null };

/**
 * The routines whose task is due on `dayIso`: it's a day they repeat on and
 * after their newest task's day. Each goes to its helper, or Unassigned when
 * she's away then or no longer works here (routineAssignee).
 */
export function routinesDueOn(
  routines: Routine[],
  dayIso: string,
  timeOff: TimeOff[],
  activeHelperIds: string[],
): DueRoutine[] {
  const wd = weekdayOf(parseISODate(dayIso));
  return routines
    .filter((r) => routineMatches(r, wd) && (!r.lastDay || r.lastDay < dayIso))
    .map((routine) => ({
      routine,
      helperId: routineAssignee(routine, dayIso, timeOff, activeHelperIds),
    }));
}

/**
 * The day a new routine's first task goes on: today if it repeats today and
 * its time hasn't passed yet, otherwise the next day it repeats on.
 */
export function firstRoutineDay(
  recurrence: Exclude<Recurrence, "none">,
  todayIso: string,
  nowMinutes: number,
  time: string,
): string {
  const today = parseISODate(todayIso);
  const startsAhead = parseTimeToMinutes(time) > nowMinutes;
  for (let n = startsAhead ? 0 : 1; n <= 7; n++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
    if (routineMatches({ recurrence }, weekdayOf(d))) return toISODate(d);
  }
  return todayIso;
}

/**
 * The id a series' task for a day gets when the web makes it (before
 * add-repeating-tasks.sql). The same series and day always give the same id,
 * so a second tab making it too is refused by the primary key instead of
 * doubling it. Shaped like a UUID (version 5 style bits, from SHA-256).
 */
export async function occurrenceId(series: string, dayIso: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`linara-routine:${series}|${dayIso}`),
  );
  const b = new Uint8Array(digest).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
