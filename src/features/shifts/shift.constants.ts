import { WEEKDAYS, type Weekday } from "@/lib/time";
import type { DaySchedule, WeekSchedule } from "./shift.types";

const buildWeek = (workingDays: Weekday[], template: Omit<DaySchedule, "rest">): WeekSchedule => {
  const week = {} as WeekSchedule;
  for (const d of WEEKDAYS) {
    week[d] = workingDays.includes(d)
      ? {
          rest: false,
          segments: template.segments.map((s) => ({ ...s })),
          breakStart: template.breakStart,
          breakEnd: template.breakEnd,
        }
      : { rest: true, segments: [] };
  }
  return week;
};

export const INITIAL_SCHEDULES: Record<string, WeekSchedule> = {
  rosa: buildWeek(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], {
    segments: [{ start: "06:00", end: "19:00" }],
    breakStart: "13:00",
    breakEnd: "15:00",
  }),
  lita: buildWeek(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"], {
    segments: [{ start: "05:30", end: "19:30" }],
    breakStart: "14:00",
    breakEnd: "16:00",
  }),
  manuel: buildWeek(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], {
    segments: [
      { start: "06:00", end: "09:00" },
      { start: "14:30", end: "18:00" },
    ],
  }),
};
