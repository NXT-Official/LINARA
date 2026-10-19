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
 * Household billing. The billing tables live in the Linara console's SQL
 * (LINARA_ADMIN supabase/017-billing-subscriptions.sql) and have no policies:
 * a household reaches them only through that file's `billing_*` functions,
 * which check `auth.uid()` themselves. Until that SQL is applied the functions
 * don't exist, so reads say `available: false` and the plan page says payments
 * aren't on yet.
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

/** Where a handled-but-worrying error goes. The server functions wire in Sentry; tests pass a spy. */
export type Report = (error: unknown) => Promise<void>;

/** Imported inside the handler: a `*.server` file must stay out of the client bundle's import graph. */
const reportToSentry: Report = async (error) => {
  const { captureServerError } = await import("@/lib/observability/sentry.server");
  await captureServerError(error);
};

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

/** The objects of a jsonb array; anything else reads as none. */
const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.map(record).filter((r): r is Record<string, unknown> => r !== null)
    : [];

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

const toInterval = (v: unknown): Subscription["interval"] =>
  v === "one_time" || v === "monthly" || v === "yearly" ? v : null;

function toSubscription(row: Record<string, unknown>): Subscription {
  return {
    id: String(row.id),
    planId: String(row.plan_id),
    planName: str(row.plan_name),
    interval: toInterval(row.interval),
    ownerUserId: str(row.owner_user_id),
    status: String(row.status),
    helperSeats: num(row.helper_seats),
    managerSeats: num(row.manager_seats),
    homeSeats: Number(row.home_seats),
    amountCentavos: Number(row.amount_centavos),
    currentPeriodStart: str(row.current_period_start),
    currentPeriodEnd: str(row.current_period_end),
    canceledAt: str(row.canceled_at),
    revoked: row.revoked === true,
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

function toHome(row: Record<string, unknown>): BillingHome {
  return { id: String(row.id), name: String(row.name ?? ""), primary: row.primary === true };
}

/**
 * Newest first, as the plan page reads `invoices[0]` as the latest. The SQL
 * does not promise an order, so the snapshot sets it; a tie goes to the
 * higher invoice number.
 */
const newestFirst = <T extends { createdAt: string }>(
  items: T[],
  tieBreak: (a: T, b: T) => number = () => 0,
): T[] =>
  [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || tieBreak(a, b));

/** Only a literal `true` offers a trial: any other answer means no trial. */
function toTrialMap(value: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [planId, eligible] of Object.entries(record(value) ?? {})) {
    out[planId] = eligible === true;
  }
  return out;
}

/** billing_trial_eligible is the one rule. A missing function or any error means no trial. */
async function trialEligibleFor(
  client: Client,
  planId: string,
  homeIds: string[],
): Promise<boolean> {
  const { data, error } = await client.rpc("billing_trial_eligible", {
    p_plan_id: planId,
    p_home_ids: homeIds,
  });
  return !error && data === true;
}

const EMPTY: BillingSnapshot = {
  available: false,
  entitlements: null,
  subscriptions: [],
  invoices: [],
  usage: { helpers: 0, managers: 0 },
  homes: [],
  trialEligibleByPlan: {},
};

/**
 * One call: billing_my_billing returns this home's entitlements, the
 * subscriptions covering it (without the staff note), their invoices (only
 * the 13 columns a household may see), seats in use, the caller's homes and
 * the per-plan trial answer.
 */
export async function getBilling(client: Client, householdId: string): Promise<BillingSnapshot> {
  const { data, error } = await client.rpc("billing_my_billing", {
    p_household_id: householdId,
  });
  if (missing(error)) return EMPTY;
  if (error) fail(error, "Couldn't load your plan");
  const reply = oneRow(data);
  if (!reply) fail(null, "Couldn't load your plan");

  const entitlements = record(reply.entitlements);
  const usage = record(reply.usage);
  return {
    available: true,
    entitlements: entitlements ? toEntitlements(entitlements) : null,
    subscriptions: newestFirst(rows(reply.subscriptions).map(toSubscription)),
    invoices: newestFirst(rows(reply.invoices).map(toInvoice), (a, b) =>
      b.invoiceNumber.localeCompare(a.invoiceNumber),
    ),
    usage: { helpers: Number(usage?.helpers ?? 0), managers: Number(usage?.managers ?? 0) },
    homes: rows(reply.homes).map(toHome),
    trialEligibleByPlan: toTrialMap(reply.trial_eligible_by_plan),
  };
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
 * The reused invoice's own payment page while it is pending and unexpired.
 * billing_my_billing is the only place a household can read a payment link.
 * A failed look returns null, and the caller opens a fresh session instead:
 * the webhook settles the invoice by external_id whichever session is paid.
 */
async function openLinkOf(
  client: Client,
  householdId: string,
  invoiceId: string,
): Promise<string | null> {
  let invoices: PlatformInvoice[];
  try {
    invoices = (await getBilling(client, householdId)).invoices;
  } catch {
    return null;
  }
  const invoice = invoices.find((i) => i.id === invoiceId);
  const expires = invoice?.expiresAt ? new Date(invoice.expiresAt).getTime() : 0;
  return invoice?.paymentUrl && invoice.status === "pending" && expires > Date.now()
    ? invoice.paymentUrl
    : null;
}

/**
 * Turns a pending invoice into a payment page. A renewal that landed on an
 * invoice with a live link reuses it, so two taps never make two sessions.
 */
async function payInvoice(
  client: Client,
  start: InvoiceStart & { invoiceId: string },
  householdId: string | null,
  email: string,
  env: BillingEnv,
  secretKey: string,
  fetchImpl: typeof fetch,
  report: Report,
): Promise<CheckoutResult> {
  if (start.reused && householdId) {
    const url = await openLinkOf(client, householdId, start.invoiceId);
    if (url) return { ok: true, invoiceUrl: url, trialing: false, invoiceId: start.invoiceId };
  }

  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, code: "NOT_FOUND" };
  const customerEmail = email.trim() || user.email || "";
  if (!customerEmail) return { ok: false, code: "PAYMENT_PROVIDER" };
  const { data: profile } = await client
    .from("user_profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();
  const fullName = str(record(profile)?.full_name)?.trim();

  let session;
  try {
    session = await createPaymentSession(
      {
        referenceId: start.externalId,
        amountCentavos: start.amountCentavos,
        customer: {
          // Xendit takes an alphanumeric customer reference_id; a uuid's hyphens go.
          // src: https://docs.xendit.co/apidocs/create-session.md · Payment Sessions · 2026-10-19
          referenceId: user.id.replace(/-/g, ""),
          email: customerEmail,
          givenNames: fullName || customerEmail.split("@")[0] || "Linara",
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

  // A failed attach still leaves a payable session (the webhook finds the
  // invoice by external_id), so report it and send the household on to pay.
  const { error: attachError } = await client.rpc("billing_attach_session", {
    p_invoice_id: start.invoiceId,
    p_xendit_id: session.sessionId,
    p_url: session.paymentUrl,
    p_expires_at: session.expiresAt,
    p_payer_email: customerEmail,
  });
  if (attachError) {
    await report(new Error(`billing_attach_session: ${attachError.message}`));
  }
  return { ok: true, invoiceUrl: session.paymentUrl, trialing: false, invoiceId: start.invoiceId };
}

/** Fail closed: a session is made only with the flag on AND the key set. */
const checkoutOpen = (env: BillingEnv): env is BillingEnv & { secretKey: string } =>
  env.platformBilling === "on" && !!env.secretKey;

async function finish(
  client: Client,
  data: unknown,
  householdId: string | null,
  email: string,
  env: BillingEnv,
  fetchImpl: typeof fetch,
  report: Report,
): Promise<CheckoutResult> {
  const start = toStart(data);
  if (!start) return { ok: false, code: "NOT_FOUND" };
  if (start.invoiceId === null)
    return { ok: true, invoiceUrl: null, trialing: true, invoiceId: null };
  // Backstop: the callers close the gate before any RPC, so this is only
  // reachable if the SQL decided on a payment we did not expect.
  if (!checkoutOpen(env)) return { available: false };
  return payInvoice(
    client,
    { ...start, invoiceId: start.invoiceId },
    householdId,
    email,
    env,
    env.secretKey,
    fetchImpl,
    report,
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
  report: Report = reportToSentry,
): Promise<CheckoutResult> {
  // A trial takes no payment, so it may start with billing off. Anything
  // else must not touch the database until checkout is open: a refused Pay
  // click would leave a pending subscription and burn an invoice number.
  const trial = await trialEligibleFor(client, input.planId, input.homeIds);
  if (!trial && !checkoutOpen(env)) return { available: false };

  const { data, error } = await client.rpc("billing_start", {
    p_plan_id: input.planId,
    p_helper_seats: input.helperSeats,
    p_manager_seats: input.managerSeats,
    p_home_ids: input.homeIds,
  });
  if (missing(error)) return { available: false };
  if (error) return { ok: false, code: error.message ?? "" };
  // billing_start always makes a new invoice, so there is no link to reuse.
  return finish(client, data, null, input.email, env, fetchImpl, report);
}

export async function renewCheckout(
  client: Client,
  input: { subscriptionId: string; householdId: string; email: string },
  env: BillingEnv,
  fetchImpl: typeof fetch = fetch,
  report: Report = reportToSentry,
): Promise<CheckoutResult> {
  if (!checkoutOpen(env)) return { available: false };
  const { data, error } = await client.rpc("billing_renew", {
    p_subscription_id: input.subscriptionId,
  });
  if (missing(error)) return { available: false };
  if (error) return { ok: false, code: error.message ?? "" };
  return finish(client, data, input.householdId, input.email, env, fetchImpl, report);
}

export async function cancelSubscription(
  client: Client,
  subscriptionId: string,
): Promise<{ ok: true } | { ok: false; code: string }> {
  const { error } = await client.rpc("billing_cancel", { p_subscription_id: subscriptionId });
  if (error) return { ok: false, code: error.message ?? "" };
  return { ok: true };
}

export const getBillingFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; householdId: string }) => data)
  .handler(({ data }) => getBilling(createAuthedClient(data.token), data.householdId));

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
  .validator(
    (data: { token: string; subscriptionId: string; householdId: string; email: string }) => data,
  )
  .handler(({ data }) => renewCheckout(createAuthedClient(data.token), data, readBillingEnv()));

export const cancelFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; subscriptionId: string }) => data)
  .handler(({ data }) => cancelSubscription(createAuthedClient(data.token), data.subscriptionId));
