import { useEffect, useMemo, useState } from "react";

import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";

import { statusFor } from "../availability.utils";
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
    const base = statusFor(currentHelperId, schedules, nowTs);
    if (base.status === "off" && !base.quiet) {
      if (manual.manual === "available" && manual.availableUntil && manual.availableUntil > nowTs) {
        return {
          status: "available",
          until: manual.availableUntil,
          quiet: false,
          restDay: base.restDay,
        };
      }
    }
    return base;
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
