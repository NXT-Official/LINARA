import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import type { Label, LabelTone, Team } from "./teams.types";

// Teams and labels (supabase/add-teams-and-labels.sql). Every manager reads
// them; primary and co-managers write them. RLS holds both rules; the check
// here only turns a refusal into a sentence.

const TONES: LabelTone[] = ["sand", "pine", "clay", "sky", "sage", "plum"];

/** 42P01 / PGRST205: the tables aren't there yet (SQL not applied). */
const isMissingTable = (code?: string) => code === "42P01" || code === "PGRST205";

async function requireManager(token: string) {
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
  if (!profile) throw new Error("Unauthorized: Profile not found");
  if (profile.user_type !== "primary_manager" && profile.user_type !== "co_manager") {
    throw new Error("Only the primary manager or a co-manager can change teams and labels");
  }
  return { client, householdId: profile.household_id as string };
}

/** A friendlier line for the unique-name index. */
function nameError(error: { code?: string; message: string }, what: "team" | "label"): Error {
  if (error.code === "23505") return new Error(`There's already a ${what} with that name`);
  return new Error(error.message);
}

const cleanName = (name: string, max: number) => {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Give it a name");
  if (trimmed.length > max) throw new Error(`Keep it to ${max} characters`);
  return trimmed;
};

export type TeamsSnapshot = {
  /** False until add-teams-and-labels.sql is applied: the UI hides teams. */
  available: boolean;
  teams: Team[];
  labels: Label[];
  /** Who has which label. */
  assignments: { helperId: string; labelId: string }[];
};

/** Everything in one round trip's worth of queries, however many staff. */
export const listTeamsAndLabelsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<TeamsSnapshot> => {
    const client = createAuthedClient(data.token);
    const [teams, labels, assignments] = await Promise.all([
      client.from("household_teams").select("id, name").order("name"),
      client.from("household_labels").select("id, name, tone").order("name"),
      client.from("helper_labels").select("helper_id, label_id"),
    ]);
    if (isMissingTable(teams.error?.code)) {
      return { available: false, teams: [], labels: [], assignments: [] };
    }
    const failed = teams.error ?? labels.error ?? assignments.error;
    if (failed) throw new Error(failed.message);
    return {
      available: true,
      teams: (teams.data ?? []) as Team[],
      labels: (labels.data ?? []) as Label[],
      assignments: (assignments.data ?? []).map((r) => ({
        helperId: r.helper_id as string,
        labelId: r.label_id as string,
      })),
    };
  });

export const createTeamFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; name: string }) => ({
    ...data,
    name: cleanName(data.name, 40),
  }))
  .handler(async ({ data }): Promise<Team> => {
    const { client, householdId } = await requireManager(data.token);
    const { data: row, error } = await client
      .from("household_teams")
      .insert({ household_id: householdId, name: data.name })
      .select("id, name")
      .single();
    if (error || !row) throw nameError(error ?? { message: "Couldn't add the team" }, "team");
    return row as Team;
  });

export const renameTeamFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; teamId: string; name: string }) => ({
    ...data,
    name: cleanName(data.name, 40),
  }))
  .handler(async ({ data }) => {
    const { client } = await requireManager(data.token);
    const { error } = await client
      .from("household_teams")
      .update({ name: data.name })
      .eq("id", data.teamId);
    if (error) throw nameError(error, "team");
  });

/** Its helpers stay, on no team (ON DELETE SET NULL). */
export const deleteTeamFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; teamId: string }) => data)
  .handler(async ({ data }) => {
    const { client } = await requireManager(data.token);
    const { error } = await client.from("household_teams").delete().eq("id", data.teamId);
    if (error) throw new Error(error.message);
  });

export const createLabelFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; name: string; tone: LabelTone }) => {
    if (!TONES.includes(data.tone)) throw new Error("Unknown colour");
    return { ...data, name: cleanName(data.name, 30) };
  })
  .handler(async ({ data }): Promise<Label> => {
    const { client, householdId } = await requireManager(data.token);
    const { data: row, error } = await client
      .from("household_labels")
      .insert({ household_id: householdId, name: data.name, tone: data.tone })
      .select("id, name, tone")
      .single();
    if (error || !row) throw nameError(error ?? { message: "Couldn't add the label" }, "label");
    return row as Label;
  });

export const updateLabelFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; labelId: string; name: string; tone: LabelTone }) => {
    if (!TONES.includes(data.tone)) throw new Error("Unknown colour");
    return { ...data, name: cleanName(data.name, 30) };
  })
  .handler(async ({ data }) => {
    const { client } = await requireManager(data.token);
    const { error } = await client
      .from("household_labels")
      .update({ name: data.name, tone: data.tone })
      .eq("id", data.labelId);
    if (error) throw nameError(error, "label");
  });

/** Comes off everyone who had it (ON DELETE CASCADE). */
export const deleteLabelFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; labelId: string }) => data)
  .handler(async ({ data }) => {
    const { client } = await requireManager(data.token);
    const { error } = await client.from("household_labels").delete().eq("id", data.labelId);
    if (error) throw new Error(error.message);
  });

/** One or many helpers onto a team, or onto none (null). */
export const setHelpersTeamFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperIds: string[]; teamId: string | null }) => data)
  .handler(async ({ data }) => {
    if (data.helperIds.length === 0) return;
    const { client } = await requireManager(data.token);
    const { error } = await client
      .from("helper_profiles")
      .update({ team_id: data.teamId })
      .in("id", data.helperIds);
    if (error) throw new Error(error.message);
  });

/**
 * One label onto (add) or off (remove) one or many helpers: the bulk action
 * on People, and a single helper's chip.
 */
export const setLabelOnHelpersFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; labelId: string; helperIds: string[]; on: boolean }) => data)
  .handler(async ({ data }) => {
    if (data.helperIds.length === 0) return;
    const { client } = await requireManager(data.token);
    const { error } = data.on
      ? await client.from("helper_labels").upsert(
          data.helperIds.map((helperId) => ({ helper_id: helperId, label_id: data.labelId })),
          { onConflict: "helper_id,label_id", ignoreDuplicates: true },
        )
      : await client
          .from("helper_labels")
          .delete()
          .eq("label_id", data.labelId)
          .in("helper_id", data.helperIds);
    if (error) throw new Error(error.message);
  });
