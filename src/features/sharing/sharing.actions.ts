import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import type { FamilyHouse, SavedPlace, SharedHelperRow } from "./sharing.types";

// Shared staff and places (supabase/add-shared-staff-and-places.sql). RLS and
// the triggers there hold every rule; these only read and write.

/** 42P01 / PGRST205 / PGRST202: the tables or functions aren't there yet. */
const isMissing = (error: { code?: string; message?: string } | null) =>
  !!error &&
  (error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST202" ||
    /could not find the function|does not exist/i.test(error.message ?? ""));

export type SharingSnapshot = {
  /** False until add-shared-staff-and-places.sql is applied: the UI hides all of it. */
  available: boolean;
  /** Staff employed elsewhere in the family who also work here. */
  sharedHelpers: SharedHelperRow[];
  /** This household's own staff, and the other households they also work in. */
  elsewhere: { helperId: string; householdId: string }[];
  /** Teams of this household that someone also covers. */
  covers: { helperId: string; teamId: string }[];
  /** Every household of the family, this one included. */
  family: FamilyHouse[];
  /** The ones the caller runs (primary or co), which they can share staff into. */
  runs: string[];
  places: SavedPlace[];
};

const EMPTY: SharingSnapshot = {
  available: false,
  sharedHelpers: [],
  elsewhere: [],
  covers: [],
  family: [],
  runs: [],
  places: [],
};

/** A shared helper's approved leave (whole days) or rest off (a window), dates only. */
export type SharedTimeOffRow = {
  helper_id: string;
  day_from: string;
  day_to: string;
  start_time: string | null;
  end_time: string | null;
};

/**
 * Approved time off of staff shared into this household
 * (add-shared-staff-availability.sql): her leave belongs to her home
 * household, so it isn't otherwise readable here. Never the kind or reason.
 */
export const listSharedTimeOffFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; from: string; to: string }) => data)
  .handler(async ({ data }): Promise<SharedTimeOffRow[]> => {
    const client = createAuthedClient(data.token);
    const { data: rows, error } = await client.rpc("shared_staff_time_off", {
      p_from: data.from,
      p_to: data.to,
    });
    if (isMissing(error)) return [];
    if (error) throw new Error(error.message);
    return (rows ?? []) as SharedTimeOffRow[];
  });

/** A task of someone who works here, at another of the family's houses. */
export type BusyElsewhere = {
  helperId: string;
  householdName: string;
  /** ISO instant. */
  start: string;
  /** Null when the task has no length (counts as 30 minutes). */
  durationMinutes: number | null;
  status: string;
};

/** When staff who work here are booked at the family's other houses: time, house and status only. */
export const listBusyElsewhereFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; from: string; to: string }) => data)
  .handler(async ({ data }): Promise<BusyElsewhere[]> => {
    const client = createAuthedClient(data.token);
    const { data: rows, error } = await client.rpc("staff_elsewhere", {
      p_from: data.from,
      p_to: data.to,
    });
    if (isMissing(error)) return [];
    if (error) throw new Error(error.message);
    return (
      (rows ?? []) as {
        helper_id: string;
        household_name: string;
        scheduled_start: string;
        duration_minutes?: number | null;
        status: string;
      }[]
    ).map((r) => ({
      helperId: r.helper_id,
      householdName: r.household_name,
      start: r.scheduled_start,
      durationMinutes: r.duration_minutes ?? null,
      status: r.status,
    }));
  });

export const listSharingFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<SharingSnapshot> => {
    const client = createAuthedClient(data.token);
    const [shared, elsewhere, covers, family, mine, places] = await Promise.all([
      client.rpc("shared_helpers"),
      client.from("helper_households").select("helper_id, household_id"),
      client.from("helper_team_covers").select("helper_id, team_id"),
      client.rpc("family_households"),
      client.rpc("my_households"),
      client.from("household_places").select("id, name").order("name"),
    ]);
    if (isMissing(shared.error) || isMissing(places.error)) return EMPTY;
    const failed = shared.error ?? elsewhere.error ?? covers.error ?? family.error ?? places.error;
    if (failed) throw new Error(failed.message);
    return {
      available: true,
      sharedHelpers: (shared.data ?? []) as SharedHelperRow[],
      elsewhere: (elsewhere.data ?? []).map((r) => ({
        helperId: r.helper_id as string,
        householdId: r.household_id as string,
      })),
      covers: (covers.data ?? []).map((r) => ({
        helperId: r.helper_id as string,
        teamId: r.team_id as string,
      })),
      family: (family.data ?? []) as FamilyHouse[],
      // my_households() is from add-household-managers.sql; without it, none.
      runs: mine.error
        ? []
        : ((mine.data ?? []) as { household_id: string; role: string }[])
            .filter((r) => r.role === "primary_manager" || r.role === "co_manager")
            .map((r) => r.household_id),
      places: (places.data ?? []) as SavedPlace[],
    };
  });

/** She also works in that household (or, `on: false`, no longer does). */
export const setHelperHouseholdFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string; householdId: string; on: boolean }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = data.on
      ? await client
          .from("helper_households")
          .upsert(
            { helper_id: data.helperId, household_id: data.householdId },
            { onConflict: "helper_id,household_id", ignoreDuplicates: true },
          )
      : await client
          .from("helper_households")
          .delete()
          .eq("helper_id", data.helperId)
          .eq("household_id", data.householdId);
    if (error) throw new Error(error.message);
  });

/** A shared helper's team in this household. */
export const setSharedTeamFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; helperId: string; householdId: string; teamId: string | null }) => data,
  )
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = await client
      .from("helper_households")
      .update({ team_id: data.teamId })
      .eq("helper_id", data.helperId)
      .eq("household_id", data.householdId);
    if (error) throw new Error(error.message);
  });

/** She also covers this team (or no longer does). */
export const setCoverFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string; teamId: string; on: boolean }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = data.on
      ? await client
          .from("helper_team_covers")
          .upsert(
            { helper_id: data.helperId, team_id: data.teamId },
            { onConflict: "helper_id,team_id", ignoreDuplicates: true },
          )
      : await client
          .from("helper_team_covers")
          .delete()
          .eq("helper_id", data.helperId)
          .eq("team_id", data.teamId);
    if (error) throw new Error(error.message);
  });

export const createPlaceFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; householdId: string; name: string }) => {
    const name = data.name.trim().replace(/\s+/g, " ");
    if (!name) throw new Error("Give it a name");
    if (name.length > 40) throw new Error("Keep it to 40 characters");
    return { ...data, name };
  })
  .handler(async ({ data }): Promise<SavedPlace> => {
    const client = createAuthedClient(data.token);
    const { data: row, error } = await client
      .from("household_places")
      .insert({ household_id: data.householdId, name: data.name })
      .select("id, name")
      .single();
    if (error?.code === "23505") throw new Error("There's already a place with that name");
    if (error || !row) throw new Error(error?.message ?? "Couldn't add the place");
    return row as SavedPlace;
  });

/** Trips that went there keep their task; that end of the trip is cleared. */
export const deletePlaceFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; placeId: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = await client.from("household_places").delete().eq("id", data.placeId);
    if (error) throw new Error(error.message);
  });
