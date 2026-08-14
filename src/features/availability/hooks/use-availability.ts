import { useEffect, useMemo, useState } from "react";

import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";
import { isMinuteInShift, isRestDay } from "@/features/shifts/shift.utils";
import { weekdayOf } from "@/lib/time";

import { QUIET_END_HOUR, QUIET_START_HOUR } from "../availability.constants";
import type { RosaStatus } from "../availability.types";

const STORAGE_KEY = "linara.rosaAvail";

type ManualAvailability = { manual: "available" | "off"; availableUntil: number | null };
const OFF: ManualAvailability = { manual: "off", availableUntil: null };

export type Availability = {
  status: RosaStatus;
  /** Opt in to being reachable for a bounded window. Refused during quiet hours. */
  setAvailable: (hours: number) => void;
  setOff: () => void;
};

/**
 * Rosa's live reachability.
 *
 * On-shift is derived from her schedule; outside it, rest is the default and she
 * must opt in for a bounded window. Quiet hours are hard-off — nothing but an
 * emergency crosses them. Her opt-in survives a reload via localStorage.
 */
export function useAvailability({
  nowTs,
  schedules,
  currentHelperId,
}: {
  nowTs: number;
  schedules: ScheduleStore;
  /** Real helper_profiles id of the one helper with a first-class device -- null
   * until a real helper has claimed their account (see app-store-provider.tsx). */
  currentHelperId: string | null;
}): Availability {
  const [manual, setManual] = useState<ManualAvailability>(OFF);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setManual(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(manual));
    } catch {
      // ignore
    }
  }, [manual]);

  // Auto-return to Off when the "Available until" window expires.
  useEffect(() => {
    if (manual.manual === "available" && manual.availableUntil && manual.availableUntil <= nowTs) {
      setManual(OFF);
    }
  }, [nowTs, manual]);

  const status: RosaStatus = useMemo(() => {
    const d = new Date(nowTs);
    const h = d.getHours();
    const weekday = weekdayOf(d);
    const schedule = currentHelperId ? schedules.scheduleFor(currentHelperId) : undefined;
    const restDayToday = schedule ? isRestDay(weekday, schedule) : false;
    const isQuiet = h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
    const minutes = h * 60 + d.getMinutes();
    const onShift = !isQuiet && !!schedule && isMinuteInShift(minutes, weekday, schedule);
    if (isQuiet) return { status: "off", until: null, quiet: true, restDay: restDayToday };
    if (onShift) return { status: "on_shift", until: null, quiet: false, restDay: false };
    if (manual.manual === "available" && manual.availableUntil && manual.availableUntil > nowTs) {
      return {
        status: "available",
        until: manual.availableUntil,
        quiet: false,
        restDay: restDayToday,
      };
    }
    return { status: "off", until: null, quiet: false, restDay: restDayToday };
  }, [nowTs, manual, schedules, currentHelperId]);

  return {
    status,
    setAvailable: (hours: number) => {
      if (status.quiet) return; // quiet hours are hard-off
      setManual({ manual: "available", availableUntil: nowTs + hours * 60 * 60 * 1000 });
    },
    setOff: () => setManual(OFF),
  };
}
