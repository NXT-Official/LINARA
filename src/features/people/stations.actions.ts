import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import { DEFAULT_STATIONS, type Station } from "./people.types";

// A household's stations (supabase/add-household-stations.sql). Everyone in
// it reads them; primary and co-managers change them. RLS and the table's
// triggers hold every rule (a station in use can't go, a rename follows onto
// staff); the checks here only turn a refusal into a sentence.

/** 42P01 / PGRST205: the table isn't there yet (SQL not applied). */
const isMissingTable = (code?: string) => code === "42P01" || code === "PGRST205";

export type StationRow = {
  id: string;
  name: Station;
  /** Current staff and pending invites on it; it can only go at 0. */
  inUse: number;
};

export type StationsSnapshot = {
  /** False until add-household-stations.sql is applied: the five, read-only. */
  available: boolean;
  stations: StationRow[];
};

async function currentHousehold(token: string) {
  const client = createAuthedClient(token);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new Error("Unauthorized: Invalid token");
  const { data: profile } = await client
    .from("user_profiles")
    .select("household_id, user_type")
    .eq("id", user.id)
    .single();
  if (!profile?.household_id) throw new Error("Unauthorized: Profile not found");
  return {
    client,
    householdId: profile.household_id as string,
    canEdit: profile.user_type === "primary_manager" || profile.user_type === "co_manager",
  };
}

async function requireEditor(token: string) {
  const ctx = await currentHousehold(token);
  if (!ctx.canEdit) {
    throw new Error("Only the primary manager or a co-manager can change stations");
  }
  return ctx;
}

const cleanName = (name: string) => {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Give it a name");
  if (trimmed.length > 30) throw new Error("Keep it to 30 characters");
  return trimmed;
};

/** Postgres' words for the unique name index, and the triggers' own, as sentences. */
function stationError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new Error("There's already a station with that name");
  return new Error(error.message);
}

/** The current household's stations, in list order, with how many people are on each. */
export const listStationsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<StationsSnapshot> => {
    const { client, householdId } = await currentHousehold(data.token);
    const [stations, staff] = await Promise.all([
      client
        .from("household_stations")
        .select("id, name")
        .eq("household_id", householdId)
        .order("sort_order")
        .order("name"),
      client
        .from("helper_profiles")
        .select("station")
        .eq("household_id", householdId)
        .neq("status", "INACTIVE"),
    ]);
    if (staff.error) throw new Error(staff.error.message);
    const counts = new Map<string, number>();
    for (const row of (staff.data ?? []) as { station: string }[]) {
      const key = row.station.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const inUse = (name: string) => counts.get(name.toLowerCase()) ?? 0;
    if (isMissingTable(stations.error?.code)) {
      return {
        available: false,
        stations: DEFAULT_STATIONS.map((name) => ({ id: name, name, inUse: inUse(name) })),
      };
    }
    if (stations.error) throw new Error(stations.error.message);
    return {
      available: true,
      stations: ((stations.data ?? []) as { id: string; name: string }[]).map((s) => ({
        ...s,
        inUse: inUse(s.name),
      })),
    };
  });

export const createStationFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; name: string }) => data)
  .handler(async ({ data }) => {
    const { client, householdId } = await requireEditor(data.token);
    const { error } = await client
      .from("household_stations")
      .insert({ household_id: householdId, name: cleanName(data.name) });
    if (error) throw stationError(error);
    return { ok: true };
  });

/** Renames it, and with it everyone on it and the house's SOPs (a trigger does both). */
export const renameStationFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; stationId: string; name: string }) => data)
  .handler(async ({ data }) => {
    const { client } = await requireEditor(data.token);
    const { data: rows, error } = await client
      .from("household_stations")
      .update({ name: cleanName(data.name) })
      .eq("id", data.stationId)
      .select("id");
    if (error) throw stationError(error);
    if (!rows?.length) throw new Error("That station is gone. Refresh the page.");
    return { ok: true };
  });

/** Refused while anyone current is on it, and for a household's last one. */
export const deleteStationFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; stationId: string }) => data)
  .handler(async ({ data }) => {
    const { client } = await requireEditor(data.token);
    const { data: rows, error } = await client
      .from("household_stations")
      .delete()
      .eq("id", data.stationId)
      .select("id");
    if (error) throw stationError(error);
    if (!rows?.length) throw new Error("That station is gone. Refresh the page.");
    return { ok: true };
  });

/** Puts one person, or a pending invite, on another of the household's stations. */
export const setHelperStationFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string; station: Station }) => data)
  .handler(async ({ data }) => {
    const { client } = await requireEditor(data.token);
    const { data: rows, error } = await client
      .from("helper_profiles")
      .update({ station: data.station })
      .eq("id", data.helperId)
      .select("id");
    if (error) throw stationError(error);
    if (!rows?.length) throw new Error("Couldn't change that person's station");
    return { ok: true };
  });
