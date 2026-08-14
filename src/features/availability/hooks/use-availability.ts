import { useMemo } from "react";

import type { HelperProfileRow } from "@/features/people/hooks/use-invites";
import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";

import { manualFromRow, statusFor } from "../availability.utils";
import type { RosaStatus } from "../availability.types";

export type Availability = {
  status: RosaStatus;
};

/**
 * The current helper's live reachability -- read-only. The manual "Available
 * for N hours" opt-in is real, Supabase-backed data now
 * (`helper_profiles.manual_status`/`.manual_available_until`), set from the
 * helper's own device (LINARA_MOBILE) -- this app only ever reads it, never
 * writes it (see MULTI_HELPER_HANDLING.md). `statusFor`/`manualFromRow` do
 * the actual derivation and are reusable for any helper, not just this one;
 * this hook exists to memoize the lookup for whichever helper is "current."
 */
export function useAvailability({
  nowTs,
  schedules,
  currentHelperId,
  helperProfiles,
}: {
  nowTs: number;
  schedules: ScheduleStore;
  /** Real helper_profiles id of the one helper with a first-class device -- null
   * until a real helper has claimed their account (see app-store-provider.tsx). */
  currentHelperId: string | null;
  helperProfiles: HelperProfileRow[];
}): Availability {
  const status = useMemo(() => {
    const row = helperProfiles.find((p) => p.id === currentHelperId);
    return statusFor(currentHelperId, schedules, nowTs, manualFromRow(row));
  }, [nowTs, schedules, currentHelperId, helperProfiles]);

  return { status };
}
