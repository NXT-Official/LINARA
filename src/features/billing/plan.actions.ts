import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient, supabaseClient } from "@/lib/supabase";

import {
  planFromRow,
  planToRow,
  settingsFromRow,
  settingsToRow,
  type Plan,
  type PlanRow,
  type PlanStatus,
  type PlatformSettings,
  type PlatformSettingsRow,
} from "./plan.types";

/**
 * Plans and the free-tier switch (supabase/add-plans.sql). RLS decides who
 * sees and writes what: anon reads active public plans, a platform admin reads
 * and writes all. Until the SQL is applied the tables don't exist, so the
 * reads say `available: false` and the pages say so instead of failing.
 */
const missingTable = (error: { code?: string; message?: string } | null) =>
  error?.code === "PGRST202" ||
  error?.code === "PGRST205" ||
  error?.code === "42883" ||
  error?.code === "42P01" ||
  /does not exist|could not find/i.test(error?.message ?? "");

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

const PLAN_ORDER = [
  { column: "sort_order", ascending: true },
  { column: "base_centavos", ascending: true },
] as const;

export const listPublicPlansFn = createServerFn({ method: "POST" })
  .validator((data: Record<string, never>) => data)
  .handler(async (): Promise<{ available: boolean; plans: Plan[] }> => {
    const { data: rows, error } = await supabaseClient
      .from("plans")
      .select("*")
      .eq("status", "active")
      .eq("is_public", true)
      .order(PLAN_ORDER[0].column, { ascending: true })
      .order(PLAN_ORDER[1].column, { ascending: true });
    if (missingTable(error)) return { available: false, plans: [] };
    if (error) fail(error, "Couldn't load the plans");
    return { available: true, plans: ((rows ?? []) as PlanRow[]).map(planFromRow) };
  });

export const listAllPlansFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<{ available: boolean; plans: Plan[] }> => {
    const client = createAuthedClient(data.token);
    const { data: rows, error } = await client
      .from("plans")
      .select("*")
      .order(PLAN_ORDER[0].column, { ascending: true })
      .order(PLAN_ORDER[1].column, { ascending: true });
    if (missingTable(error)) return { available: false, plans: [] };
    if (error) fail(error, "Couldn't load the plans");
    return { available: true, plans: ((rows ?? []) as PlanRow[]).map(planFromRow) };
  });

/** Insert when `plan.id` is empty, else update that plan. */
export const savePlanFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; plan: Plan }) => data)
  .handler(async ({ data }): Promise<Plan> => {
    const client = createAuthedClient(data.token);
    const row = planToRow(data.plan);
    const query = data.plan.id
      ? client.from("plans").update(row).eq("id", data.plan.id)
      : client.from("plans").insert(row);
    const { data: saved, error } = await query.select("*").maybeSingle();
    if (error) fail(error, "Couldn't save the plan");
    if (!saved) throw new Error("The plan wasn't saved. Only Linara admins can change plans.");
    return planFromRow(saved as PlanRow);
  });

export const setPlanStatusFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; id: string; status: PlanStatus }) => data)
  .handler(async ({ data }): Promise<Plan> => {
    const client = createAuthedClient(data.token);
    const { data: saved, error } = await client
      .from("plans")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (error) fail(error, "Couldn't change the plan");
    if (!saved) throw new Error("The plan wasn't changed. Only Linara admins can change plans.");
    return planFromRow(saved as PlanRow);
  });

export const getPlatformSettingsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<{ available: boolean; settings: PlatformSettings | null }> => {
    const client = createAuthedClient(data.token);
    const { data: row, error } = await client
      .from("platform_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (missingTable(error)) return { available: false, settings: null };
    if (error) fail(error, "Couldn't load the free tier settings");
    return {
      available: true,
      settings: row ? settingsFromRow(row as PlatformSettingsRow) : null,
    };
  });

export const savePlatformSettingsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; settings: PlatformSettings }) => data)
  .handler(async ({ data }): Promise<PlatformSettings> => {
    const client = createAuthedClient(data.token);
    const { data: saved, error } = await client
      .from("platform_settings")
      .update(settingsToRow(data.settings))
      .eq("id", 1)
      .select("*")
      .maybeSingle();
    if (error) fail(error, "Couldn't save the free tier");
    if (!saved) throw new Error("Nothing was saved. Only Linara admins can change this.");
    return settingsFromRow(saved as PlatformSettingsRow);
  });
