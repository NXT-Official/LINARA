import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabaseClient: {}, createAuthedClient: () => ({}) }));
const captureServerError = vi.hoisted(() => vi.fn());

import { cancelSubscription, getBilling, renewCheckout, startCheckout } from "./billing.actions";

const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const client = { rpc, from, auth: { getUser } } as never;

type Reply = { data: unknown; error: { message: string } | null; count?: number };
const tables: Record<string, Reply> = {};

function chainOf(result: Reply) {
  const c = {
    select: () => c,
    eq: () => c,
    in: () => c,
    neq: () => c,
    order: () => c,
    maybeSingle: async () => result,
    then: (resolve: (v: Reply) => void) => resolve(result),
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

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  getUser.mockReset();
  captureServerError.mockReset();
  getUser.mockResolvedValue({ data: { user: { id: "u1", email: "login@example.com" } } });
  tables.plans = { data: { trial_days: 0 }, error: null };
  tables.subscription_homes = { data: [], error: null };
  tables.user_profiles = { data: { full_name: "Maria Santos" }, error: null };
  tables.platform_invoices = { data: null, error: null };
  from.mockImplementation((table: string) => chainOf(tables[table] ?? { data: null, error: null }));
});

describe("startCheckout", () => {
  it("returns available:false and touches no RPC when billing is off", async () => {
    const fetchImpl = vi.fn();
    expect(await startCheckout(client, input, off, fetchImpl)).toEqual({ available: false });
    expect(rpc).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns available:false and touches no RPC without the Xendit key", async () => {
    const out = await startCheckout(client, input, { ...on, secretKey: undefined }, vi.fn());
    expect(out).toEqual({ available: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("starts a trial for an eligible home even with billing off, and never touches Xendit", async () => {
    tables.plans = { data: { trial_days: 14 }, error: null };
    rpc.mockResolvedValueOnce({ data: { ...paidRow, invoice_id: null }, error: null });
    const fetchImpl = vi.fn();
    const out = await startCheckout(client, input, off, fetchImpl);
    expect(out).toEqual({ ok: true, invoiceUrl: null, trialing: true });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("start_subscription", {
      p_plan_id: "plan-1",
      p_helper_seats: 2,
      p_manager_seats: 1,
      p_home_ids: ["h1"],
    });
  });

  it("does not treat a home with history as trial-eligible", async () => {
    tables.plans = { data: { trial_days: 14 }, error: null };
    tables.subscription_homes = { data: [{ household_id: "h1" }], error: null };
    expect(await startCheckout(client, input, off, vi.fn())).toEqual({ available: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("creates a session, attaches it and returns the payment link", async () => {
    rpc.mockResolvedValueOnce({ data: paidRow, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const fetchImpl = vi.fn().mockResolvedValue(session);
    const out = await startCheckout(client, input, on, fetchImpl, captureServerError);
    expect(out).toEqual({
      ok: true,
      invoiceUrl: "https://checkout.xendit.test/ps-1",
      trialing: false,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.reference_id).toBe("LIN-INV-0001");
    expect(body.amount).toBe(499);
    expect(body.success_return_url).toBe("https://linara.test/billing/return?paid=1");
    expect(body.customer.individual_detail.given_names).toBe("Maria Santos");
    expect(rpc).toHaveBeenLastCalledWith("attach_xendit_invoice", {
      p_invoice_id: "inv-1",
      p_xendit_id: "ps-1",
      p_url: "https://checkout.xendit.test/ps-1",
      p_expires_at: "2026-10-20T00:00:00.000Z",
    });
    expect(captureServerError).not.toHaveBeenCalled();
  });

  it("reports a failed attach but still sends the household to pay", async () => {
    rpc.mockResolvedValueOnce({ data: paidRow, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "NOT_FOUND:invoice" } });
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
    });
    expect(captureServerError).toHaveBeenCalledTimes(1);
  });

  it("falls back to the login email and the email's local part when there is no name", async () => {
    tables.user_profiles = { data: { full_name: "  " }, error: null };
    rpc.mockResolvedValueOnce({ data: paidRow, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const fetchImpl = vi.fn().mockResolvedValue(session);
    await startCheckout(client, { ...input, email: "  " }, on, fetchImpl);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.customer.email).toBe("login@example.com");
    expect(body.customer.individual_detail.given_names).toBe("login");
  });

  it("maps a coded RPC error to ok:false", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "NOT_PRIMARY:only the primary" } });
    const out = await startCheckout(client, input, on, vi.fn());
    expect(out).toEqual({ ok: false, code: "NOT_PRIMARY:only the primary" });
  });

  it("says the missing function is unavailable", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "x" } });
    expect(await startCheckout(client, input, on, vi.fn())).toEqual({ available: false });
  });

  it("reports a Xendit failure as ok:false instead of throwing", async () => {
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
  it("touches no RPC when billing is off", async () => {
    const out = await renewCheckout(client, { subscriptionId: "sub-1", email: "" }, off, vi.fn());
    expect(out).toEqual({ available: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reuses a still-open payment link instead of creating a second session", async () => {
    rpc.mockResolvedValueOnce({ data: { ...paidRow, reused: true }, error: null });
    tables.platform_invoices = {
      data: {
        payment_url: "https://checkout.xendit.test/old",
        expires_at: "2999-01-01T00:00:00.000Z",
        status: "pending",
      },
      error: null,
    };
    const fetchImpl = vi.fn();
    const out = await renewCheckout(client, { subscriptionId: "sub-1", email: "" }, on, fetchImpl);
    expect(out).toEqual({
      ok: true,
      invoiceUrl: "https://checkout.xendit.test/old",
      trialing: false,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("renew_subscription", { p_subscription_id: "sub-1" });
  });
});

describe("cancelSubscription", () => {
  it("calls the RPC and passes a coded error through", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await cancelSubscription(client, "sub-1")).toEqual({ ok: true });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "NOT_FOUND:sub" } });
    expect(await cancelSubscription(client, "sub-1")).toEqual({ ok: false, code: "NOT_FOUND:sub" });
  });
});

describe("getBilling", () => {
  it("degrades to available:false when the entitlements function is missing", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "x" } });
    const out = await getBilling(client, "h1");
    expect(out.available).toBe(false);
    expect(out.entitlements).toBeNull();
  });

  it("scopes subscriptions to this home and lists homes with history", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "household_entitlements"
        ? { data: { source: "free", helper_seats: 1, manager_seats: 1 }, error: null }
        : {
            data: [
              { household_id: "h1", name: "A", role: "primary_manager" },
              { household_id: "h2", name: "B", role: "primary_manager" },
            ],
            error: null,
          },
    );
    tables.helper_profiles = { data: null, error: null, count: 2 };
    tables.household_managers = { data: null, error: null, count: 1 };
    tables.subscription_homes = {
      data: [
        { subscription_id: "s1", household_id: "h1", subscriptions: { status: "active" } },
        { subscription_id: "s2", household_id: "h2", subscriptions: { status: "pending" } },
        { subscription_id: "s3", household_id: "h2", subscriptions: [{ status: "canceled" }] },
      ],
      error: null,
    };
    tables.subscriptions = {
      data: [
        {
          id: "s1",
          plan_id: "p",
          owner_user_id: null,
          status: "active",
          helper_seats: null,
          manager_seats: 2,
          home_seats: 1,
          amount_centavos: 100,
          created_at: "2026-10-01T00:00:00Z",
        },
      ],
      error: null,
    };
    tables.platform_invoices = { data: [], error: null };
    const out = await getBilling(client, "h1");
    expect(out.homesWithHistory.sort()).toEqual(["h1", "h2"]);
    expect(out.usage).toEqual({ helpers: 2, managers: 1 });
    expect(out.subscriptions[0]).toMatchObject({
      id: "s1",
      ownerUserId: null,
      helperSeats: null,
      managerSeats: 2,
    });
  });
});
