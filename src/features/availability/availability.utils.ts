import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";
import { isMinuteInShift, isRestDay } from "@/features/shifts/shift.utils";
import { weekdayOf } from "@/lib/time";

import { QUIET_END_HOUR, QUIET_START_HOUR } from "./availability.constants";
import type { ManualAvailability, RosaStatus } from "./availability.types";

/**
 * Schedule-derived status for any helper, layering a real manual opt-in on
 * top when one is given -- `helper_profiles.manual_status`/
 * `.manual_available_until`, set from the helper's own device
 * (LINARA_MOBILE) and readable for any helper once fetched, not just
 * `currentHelperId` (see MULTI_HELPER_HANDLING.md). `manualFromRow()` below
 * converts a raw fetched row into the shape this expects.
 */
export function statusFor(
  helperId: string | null,
  schedules: ScheduleStore,
  nowTs: number,
  manual?: ManualAvailability | null,
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
  if (manual && manual.availableUntil > nowTs) {
    return { status: "available", until: manual.availableUntil, quiet: false, restDay: restDayToday };
  }
  return { status: "off", until: null, quiet: false, restDay: restDayToday };
}

/** Converts a raw fetched `helper_profiles` row into `statusFor`'s manual
 * param -- `null` when there's no active override (matching both apps'
 * NULL/NULL "off" default). */
export function manualFromRow(
  row: { manual_status: string | null; manual_available_until: string | null } | undefined,
): ManualAvailability | null {
  if (!row || row.manual_status !== "available" || !row.manual_available_until) return null;
  return { availableUntil: new Date(row.manual_available_until).getTime() };
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
