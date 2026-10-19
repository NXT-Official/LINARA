import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient, supabaseClient } from "@/lib/supabase";

import {
  planFromRow,
  settingsFromRow,
  type Plan,
  type PlanRow,
  type PlatformSettings,
  type PlatformSettingsRow,
} from "./plan.types";

/**
 * The public plan reads. Plans and the free-tier switch are written in the
 * Linara console (LINARA_ADMIN supabase/016-billing-plans.sql); the household
 * app only reads them, through two functions: `billing_public_plans()` (anon:
 * active, public plans) and `billing_settings_public()` (signed in). Until that
 * SQL is applied the functions don't exist, so the reads say
 * `available: false` and the pages say so instead of failing.
 */
type Client = ReturnType<typeof createAuthedClient>;
type RpcError = { code?: string; message?: string } | null;

const missing = (error: RpcError) =>
  error?.code === "PGRST202" ||
  error?.code === "PGRST205" ||
  error?.code === "42883" ||
  error?.code === "42P01" ||
  /does not exist|could not find/i.test(error?.message ?? "");

function fail(error: RpcError, fallback: string): never {
  throw new Error(error?.message || fallback);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Cheapest first within a sort order, as /pricing and the plan picker list them. */
const byShelf = (a: Plan, b: Plan) => a.sortOrder - b.sortOrder || a.baseCentavos - b.baseCentavos;

export async function listPublicPlans(
  client: Client = supabaseClient,
): Promise<{ available: boolean; plans: Plan[] }> {
  const { data, error } = await client.rpc("billing_public_plans");
  if (missing(error)) return { available: false, plans: [] };
  if (error) fail(error, "Couldn't load the plans");
  const plans = (Array.isArray(data) ? data : [])
    .filter(isRecord)
    .map((row) => planFromRow(row as PlanRow));
  return { available: true, plans: plans.sort(byShelf) };
}

export async function getPlatformSettings(
  client: Client,
): Promise<{ available: boolean; settings: PlatformSettings | null }> {
  const { data, error } = await client.rpc("billing_settings_public");
  if (missing(error)) return { available: false, settings: null };
  if (error) fail(error, "Couldn't load the free tier settings");
  const row = Array.isArray(data) ? data[0] : data;
  return {
    available: true,
    settings: isRecord(row) ? settingsFromRow(row as PlatformSettingsRow) : null,
  };
}

export const listPublicPlansFn = createServerFn({ method: "POST" })
  .validator((data: Record<string, never>) => data)
  .handler(() => listPublicPlans());

export const getPlatformSettingsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(({ data }) => getPlatformSettings(createAuthedClient(data.token)));
