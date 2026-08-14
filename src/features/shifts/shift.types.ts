// One fixed shift window and one weekly rest day per helper, matching
// public.helper_profiles exactly (shift_start/shift_end/weekly_rest_day) --
// see KNOWN_GAPS.md gap #3 for why this replaced a richer per-weekday,
// split-shift model that plan.md never actually specified.
export type HelperSchedule = {
  shiftStart: string; // "HH:MM"
  shiftEnd: string; // "HH:MM"
  weeklyRestDay: number; // 0-6, Sunday = 0 -- matches helper_profiles' convention
  breakStart?: string; // "HH:MM", optional -- see break_start/break_end columns
  breakEnd?: string;
};
