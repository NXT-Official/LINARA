import { fmtHM12, parseHM, type Weekday } from "@/lib/time";
import type { HelperSchedule } from "./shift.types";

// weekly_rest_day's convention (0-6, Sunday = 0) vs. @/lib/time's 3-letter,
// Monday-first Weekday codes -- these are two different day-of-week
// vocabularies already in use across this codebase; this is the mapping
// between them.
const WEEKDAY_TO_REST_DAY_INDEX: Record<Weekday, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export const isRestDay = (weekday: Weekday, schedule: HelperSchedule): boolean =>
  WEEKDAY_TO_REST_DAY_INDEX[weekday] === schedule.weeklyRestDay;

/** 0 if `weekday` is already the rest day, else how many days until it. */
export const daysUntilRestDay = (weekday: Weekday, weeklyRestDay: number): number =>
  (weeklyRestDay - WEEKDAY_TO_REST_DAY_INDEX[weekday] + 7) % 7;

export const summarizeSchedule = (schedule: HelperSchedule): string => {
  const shift = `${fmtHM12(schedule.shiftStart)} – ${fmtHM12(schedule.shiftEnd)}`;
  const brk =
    schedule.breakStart && schedule.breakEnd
      ? ` · break ${fmtHM12(schedule.breakStart)}–${fmtHM12(schedule.breakEnd)}`
      : "";
  return shift + brk;
};

/** Is this minute-of-day, on this weekday, inside the shift and outside any break? */
export const isMinuteInShift = (
  minutes: number,
  weekday: Weekday,
  schedule: HelperSchedule,
): boolean => {
  if (isRestDay(weekday, schedule)) return false;
  const inShift = minutes >= parseHM(schedule.shiftStart) && minutes < parseHM(schedule.shiftEnd);
  if (!inShift) return false;
  if (schedule.breakStart && schedule.breakEnd) {
    if (minutes >= parseHM(schedule.breakStart) && minutes < parseHM(schedule.breakEnd)) {
      return false;
    }
  }
  return true;
};
