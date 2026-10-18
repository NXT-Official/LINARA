import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

/**
 * Every household's plan, and the two hand-sold-deal writes (supabase/add-subscriptions.sql).
 * Until that SQL is applied the functions don't exist and every answer is
 * `available: false`, so the page says so instead of failing. Errors from the
 * database arrive as messages starting NOT_ADMIN or NOT_FOUND.
 */
type DbError = { code?: string; message?: string } | null;

const missing = (error: DbError) =>
  error?.code === "PGRST202" ||
  error?.code === "42883" ||
  error?.code === "42P01" ||
  /does not exist|could not find/i.test(error?.message ?? "");

export type PaymentChannel = "bank_transfer" | "gcash" | "maya" | "cash" | "other";

export type HouseholdEntitlements = {
  source: string;
  subscriptionId: string | null;
  planName: string | null;
  status: string | null;
  effectiveStatus: string | null;
  helperSeats: number | null;
  managerSeats: number | null;
  periodEnd: string | null;
  daysLeft: number | null;
};

export type PendingInvoice = {
  id: string;
  invoiceNumber: string;
  amountCentavos: number;
  createdAt: string;
};

export type HouseholdOverview = {
  householdId: string;
  name: string;
  createdAt: string;
  managers: number;
  helpers: number;
  entitlements: HouseholdEntitlements;
  pendingInvoice: PendingInvoice | null;
};

type Json = Record<string, unknown>;

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const strOrNull = (v: unknown) => (v === null || v === undefined ? null : String(v));

function toEntitlements(raw: unknown): HouseholdEntitlements {
  const e = (raw && typeof raw === "object" ? raw : {}) as Json;
  return {
    source: String(e.source ?? "none"),
    subscriptionId: strOrNull(e.subscription_id),
    planName: strOrNull(e.plan_name),
    status: strOrNull(e.status),
    effectiveStatus: strOrNull(e.effective_status),
    helperSeats: numOrNull(e.helper_seats),
    managerSeats: numOrNull(e.manager_seats),
    periodEnd: strOrNull(e.period_end),
    daysLeft: numOrNull(e.days_left),
  };
}

function toPending(raw: unknown): PendingInvoice | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Json;
  return {
    id: String(p.id ?? ""),
    invoiceNumber: String(p.invoice_number ?? ""),
    amountCentavos: num(p.amount_centavos),
    createdAt: String(p.created_at ?? ""),
  };
}

export function toHousehold(raw: Json): HouseholdOverview {
  return {
    householdId: String(raw.household_id ?? ""),
    name: String(raw.name ?? ""),
    createdAt: String(raw.created_at ?? ""),
    managers: num(raw.managers),
    helpers: num(raw.helpers),
    entitlements: toEntitlements(raw.entitlements),
    pendingInvoice: toPending(raw.pending_invoice),
  };
}

const CHANNELS: readonly PaymentChannel[] = ["bank_transfer", "gcash", "maya", "cash", "other"];

type Client = ReturnType<typeof createAuthedClient>;

export async function listHouseholdsOverview(
  client: Client,
): Promise<{ available: boolean; households: HouseholdOverview[] }> {
  const { data, error } = await client.rpc("platform_households_overview");
  if (missing(error)) return { available: false, households: [] };
  if (error) throw new Error(error.message || "Couldn't load the households");
  if (!Array.isArray(data)) return { available: false, households: [] };
  return { available: true, households: (data as Json[]).map(toHousehold) };
}

export type GrantPlanInput = {
  householdId: string;
  planId: string;
  /** null means unlimited */
  helperSeats: number | null;
  managerSeats: number | null;
  /** null means no end date */
  periodEnd: string | null;
  note: string;
};

/** The database signals NOT_ADMIN / NOT_FOUND by message prefix; say them in words. */
export function describeAdminError(message: string): string {
  if (message.startsWith("NOT_ADMIN")) return "You don't have admin access.";
  if (message.startsWith("NOT_FOUND")) return "That household, plan or invoice no longer exists.";
  return message;
}

function firstRow(data: unknown): Json {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new Error("Nothing came back");
  return row as Json;
}

export async function grantPlan(
  client: Client,
  input: GrantPlanInput,
): Promise<{ available: boolean; subscriptionId: string | null; invoiceId: string | null }> {
  const { data, error } = await client.rpc("grant_subscription", {
    p_household_id: input.householdId,
    p_plan_id: input.planId,
    p_helper_seats: input.helperSeats,
    p_manager_seats: input.managerSeats,
    p_period_end: input.periodEnd,
    p_note: input.note,
  });
  if (missing(error)) return { available: false, subscriptionId: null, invoiceId: null };
  if (error || !data) throw new Error(error?.message || "Couldn't grant the plan");
  const row = firstRow(data);
  return {
    available: true,
    subscriptionId: strOrNull(row.subscription_id),
    invoiceId: strOrNull(row.invoice_id),
  };
}

export type MarkPaidInput = { invoiceId: string; channel: PaymentChannel; note: string };

export async function markInvoicePaid(
  client: Client,
  input: MarkPaidInput,
): Promise<{
  available: boolean;
  applied: boolean;
  invoiceStatus: string | null;
  subscriptionStatus: string | null;
}> {
  const { data, error } = await client.rpc("mark_platform_invoice_paid_manually", {
    p_invoice_id: input.invoiceId,
    p_channel: input.channel,
    p_note: input.note,
  });
  if (missing(error)) {
    return { available: false, applied: false, invoiceStatus: null, subscriptionStatus: null };
  }
  if (error || !data) throw new Error(error?.message || "Couldn't mark the invoice paid");
  const row = firstRow(data);
  return {
    available: true,
    applied: row.applied === true,
    invoiceStatus: strOrNull(row.invoice_status),
    subscriptionStatus: strOrNull(row.subscription_status),
  };
}

export const listHouseholdsOverviewFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(({ data }) => listHouseholdsOverview(createAuthedClient(data.token)));

export const grantPlanFn = createServerFn({ method: "POST" })
  .validator((data: GrantPlanInput & { token: string }) => {
    if (
      data.helperSeats !== null &&
      (!Number.isSafeInteger(data.helperSeats) || data.helperSeats < 0)
    ) {
      throw new Error("Helper seats must be 0 or more.");
    }
    if (
      data.managerSeats !== null &&
      (!Number.isSafeInteger(data.managerSeats) || data.managerSeats < 1)
    ) {
      throw new Error("Manager seats must be 1 or more.");
    }
    if (data.periodEnd !== null && Number.isNaN(Date.parse(data.periodEnd))) {
      throw new Error("Pick a period end date.");
    }
    return data;
  })
  .handler(({ data }) => {
    const { token, ...input } = data;
    return grantPlan(createAuthedClient(token), input);
  });

export const markInvoicePaidFn = createServerFn({ method: "POST" })
  .validator((data: MarkPaidInput & { token: string }) => {
    if (!CHANNELS.includes(data.channel)) throw new Error("Pick how it was paid.");
    return data;
  })
  .handler(({ data }) => {
    const { token, ...input } = data;
    return markInvoicePaid(createAuthedClient(token), input);
  });
