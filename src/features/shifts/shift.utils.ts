import { fmtHM12, parseHM } from "@/lib/time";
import type { DaySchedule } from "./shift.types";

export const summarizeDay = (d: DaySchedule): string => {
  if (d.rest) return "Rest day";
  const segs = d.segments.map((s) => `${fmtHM12(s.start)} – ${fmtHM12(s.end)}`).join(" & ");
  const brk =
    d.breakStart && d.breakEnd ? ` · break ${fmtHM12(d.breakStart)}–${fmtHM12(d.breakEnd)}` : "";
  return segs + brk;
};
export const isMinuteInDay = (minutes: number, day: DaySchedule): boolean => {
  if (day.rest) return false;
  const inSeg = day.segments.some((s) => minutes >= parseHM(s.start) && minutes < parseHM(s.end));
  if (!inSeg) return false;
  if (day.breakStart && day.breakEnd) {
    if (minutes >= parseHM(day.breakStart) && minutes < parseHM(day.breakEnd)) return false;
  }
  return true;
};
