import { useMemo } from "react";

import type { HelperProfileRow } from "@/features/people/hooks/use-invites";
import { updateHelperScheduleFn } from "@/features/people/people.actions";

import type { HelperSchedule } from "../shift.types";

export type ScheduleStore = {
  byHelper: Record<string, HelperSchedule>;
  scheduleFor: (helperId: string) => HelperSchedule | undefined;
  update: (
    helperId: string,
    patch: Partial<
      Pick<HelperSchedule, "shiftStart" | "shiftEnd" | "weeklyRestDay" | "breakStart" | "breakEnd">
    >,
  ) => Promise<void>;
};

function toSchedule(row: HelperProfileRow): HelperSchedule {
  return {
    shiftStart: row.shift_start,
    shiftEnd: row.shift_end,
    weeklyRestDay: row.weekly_rest_day,
    breakStart: row.break_start ?? undefined,
    breakEnd: row.break_end ?? undefined,
  };
}

/**
 * Derived from the same helper_profiles fetch useInvites already does for
 * the People roster -- no second Supabase round-trip. This store doesn't
 * own the underlying data, so a write goes straight to the DB and then
 * pulls the fresh row back via `refresh` rather than patching local state.
 */
export function useSchedules({
  helperProfiles,
  token,
  refresh,
}: {
  helperProfiles: HelperProfileRow[];
  token: string | null;
  refresh: () => Promise<void>;
}): ScheduleStore {
  const byHelper = useMemo(() => {
    const map: Record<string, HelperSchedule> = {};
    for (const row of helperProfiles) map[row.id] = toSchedule(row);
    return map;
  }, [helperProfiles]);

  const update: ScheduleStore["update"] = async (helperId, patch) => {
    if (!token) throw new Error("Not authenticated");
    const current = byHelper[helperId];
    if (!current) throw new Error("Unknown helper");
    const next = { ...current, ...patch };
    await updateHelperScheduleFn({
      data: {
        token,
        helperId,
        shiftStart: next.shiftStart,
        shiftEnd: next.shiftEnd,
        weeklyRestDay: next.weeklyRestDay,
        breakStart: next.breakStart ?? null,
        breakEnd: next.breakEnd ?? null,
      },
    });
    await refresh();
  };

  return {
    byHelper,
    scheduleFor: (helperId) => byHelper[helperId],
    update,
  };
}
