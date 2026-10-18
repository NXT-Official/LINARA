import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import type {
  BillingHome,
  BillingSnapshot,
  CheckoutResult,
  Entitlements,
  PlatformInvoice,
  Subscription,
} from "./billing.types";
import { createPaymentSession } from "./xendit-sessions";

/**
 * Household billing (supabase/add-subscriptions.sql). Every write is one of
 * that file's SECURITY DEFINER functions, which check the caller themselves.
 * Until the SQL is applied the functions and tables don't exist, so reads say
 * `available: false` and the plan page says payments aren't on yet.
 *
 * The plain functions below take a client and the environment as arguments so
 * tests can drive them; the server functions at the bottom only wire in the
 * token and `process.env`, read at request time.
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

export type BillingEnv = {
  platformBilling: string | undefined;
  secretKey: string | undefined;
  apiUrl: string;
  siteUrl: string;
};

/** Read at request time, never at module load. */
export function readBillingEnv(): BillingEnv {
  return {
    platformBilling: process.env.PLATFORM_BILLING,
    secretKey: process.env.XENDIT_SECRET_WRITE_KEY,
    apiUrl: process.env.XENDIT_API_URL || "https://api.xendit.co",
    siteUrl: process.env.SITE_URL || "https://linara-delta.vercel.app",
  };
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** An RPC may hand back one jsonb object or a one-row set. */
const oneRow = (value: unknown): Record<string, unknown> | null =>
  Array.isArray(value) ? record(value[0]) : record(value);

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function toEntitlements(row: Record<string, unknown>): Entitlements {
  const source = row.source === "subscription" || row.source === "free" ? row.source : "none";
  return {
    source,
    subscriptionId: str(row.subscription_id),
    planName: str(row.plan_name),
    status: str(row.status),
    effectiveStatus: str(row.effective_status),
    helperSeats: num(row.helper_seats),
    managerSeats: num(row.manager_seats),
    periodEnd: str(row.period_end),
    daysLeft: num(row.days_left),
  };
}

function toSubscription(row: Record<string, unknown>): Subscription {
  return {
    id: String(row.id),
    planId: String(row.plan_id),
    ownerUserId: String(row.owner_user_id),
    status: String(row.status),
    helperSeats: Number(row.helper_seats),
    managerSeats: Number(row.manager_seats),
    homeSeats: Number(row.home_seats),
    amountCentavos: Number(row.amount_centavos),
    currentPeriodStart: str(row.current_period_start),
    currentPeriodEnd: str(row.current_period_end),
    canceledAt: str(row.canceled_at),
    note: str(row.note),
    createdAt: String(row.created_at),
  };
}

function toInvoice(row: Record<string, unknown>): PlatformInvoice {
  return {
    id: String(row.id),
    invoiceNumber: String(row.invoice_number),
    subscriptionId: String(row.subscription_id),
    externalId: String(row.external_id),
    paymentUrl: str(row.payment_url),
    expiresAt: str(row.expires_at),
    status: String(row.status),
    amountCentavos: Number(row.amount_centavos),
    currency: String(row.currency ?? "PHP"),
    periodStart: str(row.period_start),
    periodEnd: str(row.period_end),
    paidAt: str(row.paid_at),
    createdAt: String(row.created_at),
  };
}

const EMPTY: BillingSnapshot = {
  available: false,
  entitlements: null,
  subscriptions: [],
  invoices: [],
  usage: { helpers: 0, managers: 0 },
  homes: [],
};

export async function getBilling(client: Client, householdId: string): Promise<BillingSnapshot> {
  const { data: ent, error: entError } = await client.rpc("household_entitlements", {
    p_household_id: householdId,
  });
  if (missing(entError)) return EMPTY;
  if (entError) fail(entError, "Couldn't load your plan");

  const [subs, invoices, helpers, managers, homes] = await Promise.all([
    client.from("subscriptions").select("*").order("created_at", { ascending: false }),
    client.from("platform_invoices").select("*").order("created_at", { ascending: false }),
    client
      .from("helper_profiles")
      .select("id", { count: "exact", head: true })
      .eq("household_id", householdId)
      .in("status", ["ACTIVE", "PENDING_CLAIM"]),
    client
      .from("household_managers")
      .select("user_id", { count: "exact", head: true })
      .eq("household_id", householdId),
    client.rpc("my_households"),
  ]);
  if (missing(subs.error) || missing(invoices.error)) return EMPTY;
  if (subs.error) fail(subs.error, "Couldn't load your subscriptions");
  if (invoices.error) fail(invoices.error, "Couldn't load your invoices");
  if (helpers.error) fail(helpers.error, "Couldn't count your helpers");
  if (managers.error) fail(managers.error, "Couldn't count your managers");

  // Without add-household-managers.sql there is one household and no list.
  const homeRows = missing(homes.error)
    ? []
    : ((homes.data ?? []) as { household_id: string; name: string; role: string }[]);
  if (homes.error && !missing(homes.error)) fail(homes.error, "Couldn't load your households");
  const homeList: BillingHome[] = homeRows.map((h) => ({
    id: h.household_id,
    name: h.name,
    primary: h.role === "primary_manager",
  }));

  const entRow = oneRow(ent);
  return {
    available: true,
    entitlements: entRow ? toEntitlements(entRow) : null,
    subscriptions: ((subs.data ?? []) as Record<string, unknown>[]).map(toSubscription),
    invoices: ((invoices.data ?? []) as Record<string, unknown>[]).map(toInvoice),
    usage: { helpers: helpers.count ?? 0, managers: managers.count ?? 0 },
    homes: homeList,
  };
}

export async function quote(
  client: Client,
  input: { planId: string; helperSeats: number; managerSeats: number; homeIds: string[] },
): Promise<{ ok: true; quote: { amountCentavos: number | null } } | { ok: false; code: string }> {
  const { data, error } = await client.rpc("quote_subscription", {
    p_plan_id: input.planId,
    p_helper_seats: input.helperSeats,
    p_manager_seats: input.managerSeats,
    p_home_ids: input.homeIds,
  });
  if (error) return { ok: false, code: error.message ?? "" };
  const row = oneRow(data);
  return { ok: true, quote: { amountCentavos: num(row?.amount_centavos ?? null) } };
}

type InvoiceStart = {
  subscriptionId: string;
  invoiceId: string | null;
  externalId: string;
  invoiceNumber: string;
  amountCentavos: number;
  reused: boolean;
};

function toStart(data: unknown): InvoiceStart | null {
  const row = oneRow(data);
  if (!row) return null;
  return {
    subscriptionId: String(row.subscription_id),
    invoiceId: str(row.invoice_id),
    externalId: String(row.external_id ?? ""),
    invoiceNumber: String(row.invoice_number ?? ""),
    amountCentavos: Number(row.amount_centavos),
    reused: row.reused === true,
  };
}

/**
 * Turns a pending invoice into a payment page. A renewal that landed on an
 * invoice with a live link reuses it, so two taps never make two sessions.
 */
async function payInvoice(
  client: Client,
  start: InvoiceStart & { invoiceId: string },
  email: string,
  env: BillingEnv,
  secretKey: string,
  fetchImpl: typeof fetch,
): Promise<CheckoutResult> {
  if (start.reused) {
    const { data: existing } = await client
      .from("platform_invoices")
      .select("payment_url, expires_at, status")
      .eq("id", start.invoiceId)
      .maybeSingle();
    const row = record(existing);
    const url = str(row?.payment_url);
    const expires = str(row?.expires_at);
    if (url && row?.status === "pending" && expires && new Date(expires).getTime() > Date.now()) {
      return { ok: true, invoiceUrl: url, trialing: false };
    }
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, code: "NOT_FOUND" };
  const customerEmail = email.trim() || user.email || "";
  if (!customerEmail) return { ok: false, code: "PAYMENT_PROVIDER" };

  let session;
  try {
    session = await createPaymentSession(
      {
        referenceId: start.externalId,
        amountCentavos: start.amountCentavos,
        customer: {
          referenceId: user.id,
          email: customerEmail,
          givenNames: customerEmail.split("@")[0] || "Linara",
        },
        description: `Linara subscription ${start.invoiceNumber}`,
        successUrl: `${env.siteUrl}/billing/return?paid=1`,
        cancelUrl: `${env.siteUrl}/billing/return?paid=0`,
        // Xendit's default is 30 minutes; a household may pay after supper.
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      },
      { secretKey, apiUrl: env.apiUrl },
      fetchImpl,
    );
  } catch {
    return { ok: false, code: "PAYMENT_PROVIDER" };
  }

  // A failed attach still leaves a payable session: the webhook finds the
  // invoice by external_id, so the household is sent on to pay either way.
  await client.rpc("attach_xendit_invoice", {
    p_invoice_id: start.invoiceId,
    p_xendit_id: session.sessionId,
    p_url: session.paymentUrl,
    p_expires_at: session.expiresAt,
  });
  return { ok: true, invoiceUrl: session.paymentUrl, trialing: false };
}

/** Fail closed: a session is made only with the flag on AND the key set. */
const checkoutOpen = (env: BillingEnv): env is BillingEnv & { secretKey: string } =>
  env.platformBilling === "on" && !!env.secretKey;

async function finish(
  client: Client,
  data: unknown,
  email: string,
  env: BillingEnv,
  fetchImpl: typeof fetch,
): Promise<CheckoutResult> {
  const start = toStart(data);
  if (!start) return { ok: false, code: "NOT_FOUND" };
  if (start.invoiceId === null) return { ok: true, invoiceUrl: null, trialing: true };
  if (!checkoutOpen(env)) return { available: false };
  return payInvoice(
    client,
    { ...start, invoiceId: start.invoiceId },
    email,
    env,
    env.secretKey,
    fetchImpl,
  );
}

export async function startCheckout(
  client: Client,
  input: {
    planId: string;
    helperSeats: number;
    managerSeats: number;
    homeIds: string[];
    email: string;
  },
  env: BillingEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutResult> {
  const { data, error } = await client.rpc("start_subscription", {
    p_plan_id: input.planId,
    p_helper_seats: input.helperSeats,
    p_manager_seats: input.managerSeats,
    p_home_ids: input.homeIds,
  });
  if (missing(error)) return { available: false };
  if (error) return { ok: false, code: error.message ?? "" };
  return finish(client, data, input.email, env, fetchImpl);
}

export async function renewCheckout(
  client: Client,
  input: { subscriptionId: string; email: string },
  env: BillingEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<CheckoutResult> {
  const { data, error } = await client.rpc("renew_subscription", {
    p_subscription_id: input.subscriptionId,
  });
  if (missing(error)) return { available: false };
  if (error) return { ok: false, code: error.message ?? "" };
  return finish(client, data, input.email, env, fetchImpl);
}

export async function cancelSubscription(
  client: Client,
  subscriptionId: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  const { error } = await client.rpc("cancel_subscription", { p_subscription_id: subscriptionId });
  if (error) return { ok: false, code: error.message ?? "" };
  return { ok: true };
}

export const getBillingFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; householdId: string }) => data)
  .handler(({ data }) => getBilling(createAuthedClient(data.token), data.householdId));

export const quoteFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      planId: string;
      helperSeats: number;
      managerSeats: number;
      homeIds: string[];
    }) => data,
  )
  .handler(({ data }) => quote(createAuthedClient(data.token), data));

export const startCheckoutFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      planId: string;
      helperSeats: number;
      managerSeats: number;
      homeIds: string[];
      email: string;
    }) => data,
  )
  .handler(({ data }) => startCheckout(createAuthedClient(data.token), data, readBillingEnv()));

export const renewFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; subscriptionId: string; email: string }) => data)
  .handler(({ data }) => renewCheckout(createAuthedClient(data.token), data, readBillingEnv()));

export const cancelFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; subscriptionId: string }) => data)
  .handler(({ data }) => cancelSubscription(createAuthedClient(data.token), data.subscriptionId));
