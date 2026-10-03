import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import { householdTimeZoneOf } from "./people.actions";
import type { HouseholdSummary, ManagerInvite, ManagerMember, ManagerRole } from "./people.types";

/**
 * Several managers per household, several households per manager
 * (supabase/add-household-managers.sql, KNOWN_GAPS O2). Every write is one of
 * that file's SECURITY DEFINER functions, which check the caller's role
 * themselves; these only pass the token through and shape the rows.
 *
 * Until the SQL is applied the functions don't exist (PGRST202 / 42883):
 * the reads say `available: false` and the web carries on with one manager
 * and one household, as before.
 */
const missingFunction = (error: { code?: string } | null) =>
  error?.code === "PGRST202" || error?.code === "42883";

/** The function's own message ("Only the primary manager can do that"), for the toast. */
function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

/** Where a switch, a new household or a claimed code left the account. */
export type ActiveHousehold = {
  householdId: string | null;
  userType: string;
  timeZone: string | null;
};

async function activeResult(
  client: ReturnType<typeof createAuthedClient>,
  row: { household_id: string | null; user_type: string } | null,
): Promise<ActiveHousehold> {
  return {
    householdId: row?.household_id ?? null,
    userType: row?.user_type ?? "",
    timeZone: await householdTimeZoneOf(client, row?.household_id ?? null),
  };
}

export const listMyHouseholdsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<{ available: boolean; households: HouseholdSummary[] }> => {
    const client = createAuthedClient(data.token);
    const { data: rows, error } = await client.rpc("my_households");
    if (missingFunction(error)) return { available: false, households: [] };
    if (error) fail(error, "Couldn't load your households");
    return {
      available: true,
      households: (
        (rows ?? []) as {
          household_id: string;
          name: string;
          role: ManagerRole;
          is_current: boolean;
        }[]
      ).map((r) => ({ id: r.household_id, name: r.name, role: r.role, isCurrent: r.is_current })),
    };
  });

export const switchHouseholdFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; householdId: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { data: row, error } = await client
      .rpc("switch_household", { p_household_id: data.householdId })
      .maybeSingle();
    if (error) fail(error, "Couldn't switch household");
    return activeResult(client, row as { household_id: string; user_type: string } | null);
  });

export const createHouseholdFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; name: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { data: row, error } = await client
      .rpc("create_household", { p_name: data.name })
      .maybeSingle();
    if (error) fail(error, "Couldn't create the household");
    return activeResult(client, row as { household_id: string; user_type: string } | null);
  });

export const leaveHouseholdFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { data: row, error } = await client.rpc("leave_household").maybeSingle();
    if (error) fail(error, "Couldn't leave the household");
    return activeResult(client, row as { household_id: string | null; user_type: string } | null);
  });

export const managerRosterFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<{ available: boolean; managers: ManagerMember[] }> => {
    const client = createAuthedClient(data.token);
    const { data: rows, error } = await client.rpc("household_manager_roster");
    if (missingFunction(error)) return { available: false, managers: [] };
    if (error) fail(error, "Couldn't load the household's managers");
    return {
      available: true,
      managers: (
        (rows ?? []) as {
          user_id: string;
          full_name: string;
          role: ManagerRole;
          added_at: string;
          is_you: boolean;
        }[]
      ).map((r) => ({
        userId: r.user_id,
        fullName: r.full_name,
        role: r.role,
        addedAt: r.added_at,
        isYou: r.is_you,
      })),
    };
  });

export const setManagerRoleFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; userId: string; role: ManagerRole }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = await client.rpc("set_manager_role", {
      p_user_id: data.userId,
      p_role: data.role,
    });
    if (error) fail(error, "Couldn't change their role");
    return { ok: true };
  });

export const removeManagerFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; userId: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = await client.rpc("remove_manager", { p_user_id: data.userId });
    if (error) fail(error, "Couldn't remove them");
    return { ok: true };
  });

/** Open codes only; RLS shows them to the household's primary manager alone. */
export const listManagerInvitesFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<ManagerInvite[]> => {
    const client = createAuthedClient(data.token);
    const { data: rows, error } = await client
      .from("manager_invites")
      .select("id, code, role, expires_at, created_at")
      .is("claimed_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });
    // 42P01: the table isn't there yet.
    if (error?.code === "42P01" || error?.code === "PGRST205") return [];
    if (error) fail(error, "Couldn't load invite codes");
    return (
      (rows ?? []) as {
        id: string;
        code: string;
        role: Exclude<ManagerRole, "primary_manager">;
        expires_at: string;
      }[]
    ).map((r) => ({ id: r.id, code: r.code, role: r.role, expiresAt: r.expires_at }));
  });

export const createManagerInviteFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; role: Exclude<ManagerRole, "primary_manager"> }) => data)
  .handler(async ({ data }): Promise<ManagerInvite> => {
    const client = createAuthedClient(data.token);
    const { data: row, error } = await client
      .rpc("create_manager_invite", { p_role: data.role })
      .maybeSingle();
    if (error || !row) fail(error, "Couldn't make a code");
    const r = row as {
      id: string;
      code: string;
      role: Exclude<ManagerRole, "primary_manager">;
      expires_at: string;
    };
    return { id: r.id, code: r.code, role: r.role, expiresAt: r.expires_at };
  });

export const revokeManagerInviteFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; inviteId: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { error } = await client.rpc("revoke_manager_invite", { p_invite_id: data.inviteId });
    if (error) fail(error, "Couldn't cancel the code");
    return { ok: true };
  });

/** What a code would join, for the join screen. Null: not a usable code. */
export const lookupManagerInviteFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; code: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { data: row, error } = await client
      .rpc("lookup_manager_invite", { p_code: data.code })
      .maybeSingle();
    if (error) fail(error, "Couldn't check that code");
    if (!row) return null;
    const r = row as {
      household_name: string;
      role: Exclude<ManagerRole, "primary_manager">;
      invited_by: string | null;
    };
    return { householdName: r.household_name, role: r.role, invitedBy: r.invited_by };
  });

export const claimManagerInviteFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; code: string; fullName?: string }) => data)
  .handler(async ({ data }) => {
    const client = createAuthedClient(data.token);
    const { data: row, error } = await client
      .rpc("claim_manager_invite", { p_code: data.code, p_full_name: data.fullName ?? null })
      .maybeSingle();
    if (error) fail(error, "Couldn't join with that code");
    return activeResult(client, row as { household_id: string; user_type: string } | null);
  });
