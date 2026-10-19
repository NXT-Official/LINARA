import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabaseClient: {}, createAuthedClient: () => ({}) }));
const captureServerError = vi.hoisted(() => vi.fn());

import { cancelSubscription, getBilling, renewCheckout, startCheckout } from "./billing.actions";

const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const client = { rpc, from, auth: { getUser } } as never;

type Reply = { data: unknown; error: { message: string } | null };
const tables: Record<string, Reply> = {};

function chainOf(result: Reply) {
  const c = {
    select: () => c,
    eq: () => c,
    maybeSingle: async () => result,
  };
  return c;
}

const on = {
  platformBilling: "on",
  secretKey: "xnd_key",
  apiUrl: "https://api.xendit.test",
  siteUrl: "https://linara.test",
};
const off = { ...on, platformBilling: "off" };
const input = {
  planId: "plan-1",
  helperSeats: 2,
  managerSeats: 1,
  homeIds: ["h1"],
  email: "maria@example.com",
};
const paidRow = {
  subscription_id: "sub-1",
  invoice_id: "inv-1",
  external_id: "LIN-INV-0001",
  invoice_number: "LIN-INV-0001",
  amount_centavos: 49900,
  status: "pending",
};
const session = {
  ok: true,
  status: 201,
  json: async () => ({
    payment_session_id: "ps-1",
    payment_link_url: "https://checkout.xendit.test/ps-1",
    expires_at: "2026-10-20T00:00:00.000Z",
  }),
};

/** One invoice of billing_my_billing: the 13 columns a household may see. */
const invoiceRow = (over: Record<string, unknown> = {}) => ({
  id: "inv-1",
  invoice_number: "LIN-2026-000001",
  subscription_id: "sub-1",
  external_id: "sub_sub-1_1",
  payment_url: "https://checkout.xendit.test/old",
  expires_at: "2999-01-01T00:00:00.000Z",
  status: "pending",
  amount_centavos: 49900,
  currency: "PHP",
  period_start: "2026-10-01T00:00:00+00:00",
  period_end: "2026-11-01T00:00:00+00:00",
  paid_at: null,
  created_at: "2026-10-01T00:00:00+00:00",
  ...over,
});

const subscriptionRow = (over: Record<string, unknown> = {}) => ({
  id: "sub-1",
  plan_id: "plan-1",
  plan_name: "Family",
  interval: "monthly",
  owner_user_id: null,
  status: "active",
  helper_seats: null,
  manager_seats: 2,
  home_seats: 1,
  amount_centavos: 49900,
  current_period_start: "2026-10-01T00:00:00+00:00",
  current_period_end: "2026-11-01T00:00:00+00:00",
  canceled_at: null,
  created_at: "2026-10-01T00:00:00+00:00",
  revoked: false,
  ...over,
});

const myBilling = (over: Record<string, unknown> = {}) => ({
  entitlements: {
    source: "subscription",
    subscription_id: "sub-1",
    plan_name: "Family",
    status: "active",
    effective_status: "active",
    helper_seats: null,
    manager_seats: 2,
    period_end: "2026-11-01T00:00:00+00:00",
    days_left: 13,
  },
  subscriptions: [subscriptionRow()],
  invoices: [invoiceRow()],
  usage: { helpers: 2, managers: 1 },
  homes: [
    { id: "h1", name: "A", primary: true },
    { id: "h2", name: "B", primary: false },
  ],
  trial_eligible_by_plan: { "plan-1": true, "plan-2": false },
  ...over,
});

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  getUser.mockReset();
  captureServerError.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1", email: "login@example.com" } } });
  tables.user_profiles = { data: { full_name: "Maria Santos" }, error: null };
  from.mockImplementation((table: string) => chainOf(tables[table] ?? { data: null, error: null }));
});

describe("startCheckout", () => {
  it("returns available:false and makes no write when billing is off", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const fetchImpl = vi.fn();
    expect(await startCheckout(client, input, off, fetchImpl)).toEqual({ available: false });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("billing_trial_eligible", {
      p_plan_id: "plan-1",
      p_home_ids: ["h1"],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns available:false and makes no write without the Xendit key", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    const out = await startCheckout(client, input, { ...on, secretKey: undefined }, vi.fn());
    expect(out).toEqual({ available: false });
    expect(rpc).not.toHaveBeenCalledWith("billing_start", expect.anything());
  });

  it("starts a trial for an eligible home even with billing off, and never touches Xendit", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    rpc.mockResolvedValueOnce({ data: { ...paidRow, invoice_id: null }, error: null });
    const fetchImpl = vi.fn();
    const out = await startCheckout(client, input, off, fetchImpl);
    expect(out).toEqual({ ok: true, invoiceUrl: null, trialing: true, invoiceId: null });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("billing_start", {
      p_plan_id: "plan-1",
      p_helper_seats: 2,
      p_manager_seats: 1,
      p_home_ids: ["h1"],
    });
  });

  it("treats a trial answer of false, an error or a missing RPC as no trial", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await startCheckout(client, input, off, vi.fn())).toEqual({ available: false });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "x" } });
    expect(await startCheckout(client, input, off, vi.fn())).toEqual({ available: false });
    expect(rpc).not.toHaveBeenCalledWith("billing_start", expect.anything());
  });

  it("creates a session, attaches it with the payer's email and returns the payment link", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    rpc.mockResolvedValueOnce({ data: paidRow, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const fetchImpl = vi.fn().mockResolvedValue(session);
    const out = await startCheckout(client, input, on, fetchImpl, captureServerError);
    expect(out).toEqual({
      ok: true,
      invoiceUrl: "https://checkout.xendit.test/ps-1",
      trialing: false,
      invoiceId: "inv-1",
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.reference_id).toBe("LIN-INV-0001");
    expect(body.amount).toBe(499);
    expect(body.success_return_url).toBe("https://linara.test/billing/return?paid=1");
    expect(body.cancel_return_url).toBe("https://linara.test/billing/return?paid=0");
    expect(body.customer.individual_detail.given_names).toBe("Maria Santos");
    expect(body.customer.reference_id).toBe("u1");
    expect(rpc).toHaveBeenLastCalledWith("billing_attach_session", {
      p_invoice_id: "inv-1",
      p_xendit_id: "ps-1",
      p_url: "https://checkout.xendit.test/ps-1",
      p_expires_at: "2026-10-20T00:00:00.000Z",
      p_payer_email: "maria@example.com",
    });
    expect(captureServerError).not.toHaveBeenCalled();
  });

  it("sends Xendit the customer's uuid without hyphens (an alphanumeric reference_id)", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "5b1f2c0e-0000-4000-8000-000000000001", email: "login@example.com" } },
    });
    rpc.mockResolvedValueOnce({ data: false, error: null });
    rpc.mockResolvedValueOnce({ data: paidRow, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const fetchImpl = vi.fn().mockResolvedValue(session);
    await startCheckout(client, input, on, fetchImpl, captureServerError);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.customer.reference_id).toBe("5b1f2c0e000040008000000000000001");
    expect(body.customer.reference_id).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("reports a failed attach but still sends the household to pay", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    rpc.mockResolvedValueOnce({ data: paidRow, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "BAD_SESSION:xendit_id" } });
    const out = await startCheckout(
      client,
      input,
      on,
      vi.fn().mockResolvedValue(session),
      captureServerError,
    );
    expect(out).toEqual({
      ok: true,
      invoiceUrl: "https://checkout.xendit.test/ps-1",
      trialing: false,
      invoiceId: "inv-1",
    });
    expect(captureServerError).toHaveBeenCalledTimes(1);
    expect(String(captureServerError.mock.calls[0][0])).toMatch(
      /billing_attach_session: BAD_SESSION:xendit_id/,
    );
  });

  it("falls back to the login email and the email's local part when there is no name", async () => {
    tables.user_profiles = { data: { full_name: "  " }, error: null };
    rpc.mockResolvedValueOnce({ data: false, error: null });
    rpc.mockResolvedValueOnce({ data: paidRow, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const fetchImpl = vi.fn().mockResolvedValue(session);
    await startCheckout(client, { ...input, email: "  " }, on, fetchImpl);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.customer.email).toBe("login@example.com");
    expect(body.customer.individual_detail.given_names).toBe("login");
  });

  it("maps a coded RPC error to ok:false", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "NOT_PRIMARY:only the primary" } });
    const out = await startCheckout(client, input, on, vi.fn());
    expect(out).toEqual({ ok: false, code: "NOT_PRIMARY:only the primary" });
  });

  it("says the missing function is unavailable", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "x" } });
    expect(await startCheckout(client, input, on, vi.fn())).toEqual({ available: false });
  });

  it("reports a Xendit failure as ok:false instead of throwing", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    rpc.mockResolvedValueOnce({ data: paidRow, error: null });
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error_code: "BAD", message: "no" }),
    });
    expect(await startCheckout(client, input, on, fetchImpl)).toEqual({
      ok: false,
      code: "PAYMENT_PROVIDER",
    });
  });
});

describe("renewCheckout", () => {
  const renewal = { subscriptionId: "sub-1", householdId: "h1", email: "" };

  it("touches no RPC when billing is off", async () => {
    const out = await renewCheckout(client, renewal, off, vi.fn());
    expect(out).toEqual({ available: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reuses a still-open payment link instead of creating a second session", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "billing_renew"
        ? { data: { ...paidRow, reused: true }, error: null }
        : { data: myBilling(), error: null },
    );
    const fetchImpl = vi.fn();
    const out = await renewCheckout(client, renewal, on, fetchImpl);
    expect(out).toEqual({
      ok: true,
      invoiceUrl: "https://checkout.xendit.test/old",
      trialing: false,
      invoiceId: "inv-1",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("billing_renew", { p_subscription_id: "sub-1" });
    expect(rpc).toHaveBeenCalledWith("billing_my_billing", { p_household_id: "h1" });
    expect(from).not.toHaveBeenCalled();
  });

  it("makes a fresh session when the reused invoice's link has expired", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "billing_renew"
        ? { data: { ...paidRow, reused: true }, error: null }
        : name === "billing_my_billing"
          ? {
              data: myBilling({
                invoices: [invoiceRow({ expires_at: "2000-01-01T00:00:00.000Z" })],
              }),
              error: null,
            }
          : { data: null, error: null },
    );
    const fetchImpl = vi.fn().mockResolvedValue(session);
    const out = await renewCheckout(client, renewal, on, fetchImpl, captureServerError);
    expect(out).toMatchObject({ ok: true, invoiceUrl: "https://checkout.xendit.test/ps-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenLastCalledWith("billing_attach_session", expect.anything());
  });

  it("makes a fresh session when the lookup of the reused invoice fails", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "billing_renew"
        ? { data: { ...paidRow, reused: true }, error: null }
        : name === "billing_my_billing"
          ? { data: null, error: { message: "boom" } }
          : { data: null, error: null },
    );
    const fetchImpl = vi.fn().mockResolvedValue(session);
    const out = await renewCheckout(client, renewal, on, fetchImpl, captureServerError);
    expect(out).toMatchObject({ ok: true, invoiceUrl: "https://checkout.xendit.test/ps-1" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("passes a coded error through", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "ONE_TIME_PLAN:subscription" } });
    expect(await renewCheckout(client, renewal, on, vi.fn())).toEqual({
      ok: false,
      code: "ONE_TIME_PLAN:subscription",
    });
  });
});

describe("cancelSubscription", () => {
  it("calls billing_cancel and passes a coded error through", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await cancelSubscription(client, "sub-1")).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("billing_cancel", { p_subscription_id: "sub-1" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "NOT_FOUND:sub" } });
    expect(await cancelSubscription(client, "sub-1")).toEqual({ ok: false, code: "NOT_FOUND:sub" });
  });
});

describe("getBilling", () => {
  it("degrades to available:false when billing_my_billing is missing", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "x" } });
    const out = await getBilling(client, "h1");
    expect(out.available).toBe(false);
    expect(out.entitlements).toBeNull();
    expect(out.trialEligibleByPlan).toEqual({});
  });

  it("throws on any other error, so the page keeps what it already shows", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "NOT_FOUND:household" } });
    await expect(getBilling(client, "h1")).rejects.toThrow(/NOT_FOUND:household/);
  });

  it("throws on an empty reply", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(getBilling(client, "h1")).rejects.toThrow(/Couldn't load your plan/);
  });

  it("is one billing_my_billing call and reads no table", async () => {
    rpc.mockResolvedValue({ data: myBilling(), error: null });
    await getBilling(client, "h1");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("billing_my_billing", { p_household_id: "h1" });
    expect(from).not.toHaveBeenCalled();
  });

  it("maps a subscription's interval and plan name, and reads an unknown interval as none", async () => {
    rpc.mockResolvedValue({
      data: myBilling({
        subscriptions: [
          subscriptionRow({ id: "a", interval: "one_time", plan_name: "Setup" }),
          subscriptionRow({ id: "b", interval: "weekly", plan_name: null }),
        ],
      }),
      error: null,
    });
    const out = await getBilling(client, "h1");
    const byId = Object.fromEntries(out.subscriptions.map((s) => [s.id, s]));
    expect(byId.a).toMatchObject({ interval: "one_time", planName: "Setup" });
    expect(byId.b).toMatchObject({ interval: null, planName: null });
  });

  it("maps revoked: true when present, false when absent", async () => {
    const { revoked: _drop, ...bare } = subscriptionRow({ id: "b" });
    void _drop;
    rpc.mockResolvedValue({
      data: myBilling({ subscriptions: [subscriptionRow({ id: "a", revoked: true }), bare] }),
      error: null,
    });
    const out = await getBilling(client, "h1");
    const byId = Object.fromEntries(out.subscriptions.map((s) => [s.id, s]));
    expect(byId.a?.revoked).toBe(true);
    expect(byId.b?.revoked).toBe(false);
  });

  it("maps every part of the reply into the snapshot", async () => {
    rpc.mockResolvedValue({ data: myBilling(), error: null });
    const out = await getBilling(client, "h1");
    expect(out).toEqual({
      available: true,
      entitlements: {
        source: "subscription",
        subscriptionId: "sub-1",
        planName: "Family",
        status: "active",
        effectiveStatus: "active",
        helperSeats: null,
        managerSeats: 2,
        periodEnd: "2026-11-01T00:00:00+00:00",
        daysLeft: 13,
      },
      subscriptions: [
        {
          id: "sub-1",
          planId: "plan-1",
          planName: "Family",
          interval: "monthly",
          ownerUserId: null,
          status: "active",
          helperSeats: null,
          managerSeats: 2,
          homeSeats: 1,
          amountCentavos: 49900,
          currentPeriodStart: "2026-10-01T00:00:00+00:00",
          currentPeriodEnd: "2026-11-01T00:00:00+00:00",
          canceledAt: null,
          revoked: false,
          createdAt: "2026-10-01T00:00:00+00:00",
        },
      ],
      invoices: [
        {
          id: "inv-1",
          invoiceNumber: "LIN-2026-000001",
          subscriptionId: "sub-1",
          externalId: "sub_sub-1_1",
          paymentUrl: "https://checkout.xendit.test/old",
          expiresAt: "2999-01-01T00:00:00.000Z",
          status: "pending",
          amountCentavos: 49900,
          currency: "PHP",
          periodStart: "2026-10-01T00:00:00+00:00",
          periodEnd: "2026-11-01T00:00:00+00:00",
          paidAt: null,
          createdAt: "2026-10-01T00:00:00+00:00",
        },
      ],
      usage: { helpers: 2, managers: 1 },
      homes: [
        { id: "h1", name: "A", primary: true },
        { id: "h2", name: "B", primary: false },
      ],
      trialEligibleByPlan: { "plan-1": true, "plan-2": false },
    });
  });

  it("puts the newest invoice and subscription first whatever order the reply has", async () => {
    rpc.mockResolvedValue({
      data: myBilling({
        invoices: [
          invoiceRow({ id: "old", invoice_number: "LIN-2026-000001" }),
          invoiceRow({
            id: "new",
            invoice_number: "LIN-2026-000002",
            created_at: "2026-10-15T00:00:00+00:00",
          }),
          invoiceRow({ id: "same-time", invoice_number: "LIN-2026-000003" }),
        ],
        subscriptions: [
          subscriptionRow({ id: "s-old" }),
          subscriptionRow({ id: "s-new", created_at: "2026-10-15T00:00:00Z" }),
        ],
      }),
      error: null,
    });
    const out = await getBilling(client, "h1");
    expect(out.invoices.map((i) => i.id)).toEqual(["new", "same-time", "old"]);
    expect(out.subscriptions.map((s) => s.id)).toEqual(["s-new", "s-old"]);
  });

  it("reads a missing part as empty and a non-true trial answer as no trial", async () => {
    rpc.mockResolvedValue({
      data: {
        entitlements: null,
        trial_eligible_by_plan: { "plan-1": "yes", "plan-2": null, "plan-3": true },
      },
      error: null,
    });
    const out = await getBilling(client, "h1");
    expect(out).toEqual({
      available: true,
      entitlements: null,
      subscriptions: [],
      invoices: [],
      usage: { helpers: 0, managers: 0 },
      homes: [],
      trialEligibleByPlan: { "plan-1": false, "plan-2": false, "plan-3": true },
    });
  });
});
