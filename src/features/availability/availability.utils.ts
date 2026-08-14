import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";
import { isMinuteInShift, isRestDay } from "@/features/shifts/shift.utils";
import { weekdayOf } from "@/lib/time";

import { QUIET_END_HOUR, QUIET_START_HOUR } from "./availability.constants";
import type { RosaStatus } from "./availability.types";

/**
 * Schedule-derived status for any helper, at any moment -- no manual opt-in
 * layered on top (there is no data source for another helper's manual
 * toggle; see use-availability.ts's doc comment). `useAvailability` wraps
 * this for `currentHelperId` and adds the manual layer back for that one
 * tracked helper; anything evaluating a *different* helper's reachability
 * (the friction wall, most notably) uses this directly.
 */
export function statusFor(
  helperId: string | null,
  schedules: ScheduleStore,
  nowTs: number,
): RosaStatus {
  const d = new Date(nowTs);
  const h = d.getHours();
  const weekday = weekdayOf(d);
  const schedule = helperId ? schedules.scheduleFor(helperId) : undefined;
  const restDayToday = schedule ? isRestDay(weekday, schedule) : false;
  const isQuiet = h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
  const minutes = h * 60 + d.getMinutes();
  const onShift = !isQuiet && !!schedule && isMinuteInShift(minutes, weekday, schedule);
  if (isQuiet) return { status: "off", until: null, quiet: true, restDay: restDayToday };
  if (onShift) return { status: "on_shift", until: null, quiet: false, restDay: false };
  return { status: "off", until: null, quiet: false, restDay: restDayToday };
}

// Chip styling for each availability state — shared by the manager chip and Rosa's control.

export function statusMeta(s: RosaStatus["status"]) {
  if (s === "on_shift")
    return {
      label: "On shift",
      dot: "bg-[oklch(0.68_0.14_150)]",
      cls: "bg-[oklch(0.95_0.05_150)] text-[oklch(0.32_0.1_150)]",
    };
  if (s === "available")
    return {
      label: "Available",
      dot: "bg-accent",
      cls: "bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]",
    };
  return { label: "Off", dot: "bg-muted-foreground/50", cls: "bg-secondary text-muted-foreground" };
}
