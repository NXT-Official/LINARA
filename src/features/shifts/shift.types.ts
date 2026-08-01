import type { Weekday } from "@/lib/time";

export type ShiftSegment = { start: string; end: string }; // 24h "HH:MM"
export type DaySchedule = {
  rest: boolean;
  segments: ShiftSegment[];
  breakStart?: string;
  breakEnd?: string;
};
export type WeekSchedule = Record<Weekday, DaySchedule>;
