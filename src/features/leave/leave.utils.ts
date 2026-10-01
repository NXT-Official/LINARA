import { parseISODate, startOfDayIso } from "@/lib/time";

/**
 * The instants a leave covers, for querying tickets: from the start of its
 * first household day to the start of the day after its last. Half-open, so
 * a task at midnight after the leave isn't counted.
 */
export function leaveRangeIso(startDate: string, endDate: string) {
  const end = parseISODate(endDate);
  end.setDate(end.getDate() + 1);
  return { fromIso: startOfDayIso(parseISODate(startDate)), toIso: startOfDayIso(end) };
}
