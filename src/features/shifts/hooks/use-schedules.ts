import { useState } from "react";

import type { Weekday } from "@/lib/time";

import { INITIAL_SCHEDULES } from "../shift.constants";
import type { DaySchedule, WeekSchedule } from "../shift.types";

export type ScheduleStore = {
  byHelper: Record<string, WeekSchedule>;
  weekFor: (helperId: string) => WeekSchedule;
  updateDay: (helperId: string, day: Weekday, patch: Partial<DaySchedule>) => void;
};

/** The weekly shift pattern per helper: working segments, rest days, and breaks. */
export function useSchedules(): ScheduleStore {
  const [byHelper, setByHelper] = useState<Record<string, WeekSchedule>>(INITIAL_SCHEDULES);

  const weekFor = (helperId: string) => byHelper[helperId] ?? INITIAL_SCHEDULES[helperId];

  const updateDay = (helperId: string, day: Weekday, patch: Partial<DaySchedule>) => {
    setByHelper((prev) => {
      const wk = prev[helperId] ?? INITIAL_SCHEDULES[helperId];
      return { ...prev, [helperId]: { ...wk, [day]: { ...wk[day], ...patch } } };
    });
  };

  return { byHelper, weekFor, updateDay };
}
