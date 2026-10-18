import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabaseClient: {}, createAuthedClient: () => ({}) }));

import { cancelSubscription, getBilling, renewCheckout, startCheckout } from "./billing.actions";

const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());
const client = { rpc, from, auth: { getUser } } as never;

const on = {
  platformBilling: "on",
  secretKey: "xnd_key",
  apiUrl: "https://api.xendit.test",
  siteUrl: "https://linara.test",
};
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
  getUser.mockResolvedValue({ data: { user: { id: "u1", email: "login@example.com" } } });
});

describe("startCheckout", () => {
  it("returns available:false without the Xendit key, after the RPC succeeded", async () => {
    rpc.mockResolvedValueOnce({ data: paidRow, error: null });
    const fetchImpl = vi.fn();
    const out = await startCheckout(client, input, { ...on, secretKey: undefined }, fetchImpl);
    expect(out).toEqual({ available: false });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("start_subscription", {
      p_plan_id: "plan-1",
      p_helper_seats: 2,
      p_manager_seats: 1,
      p_home_ids: ["h1"],
    });
  });

  it("returns available:false when PLATFORM_BILLING is not on, even with a key", async () => {
    rpc.mockResolvedValueOnce({ data: paidRow, error: null });
    const fetchImpl = vi.fn();
    const out = await startCheckout(client, input, { ...on, platformBilling: "off" }, fetchImpl);
    expect(out).toEqual({ available: false });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("starts a trial without touching Xendit", async () => {
    rpc.mockResolvedValueOnce({ data: { ...paidRow, invoice_id: null }, error: null });
    const fetchImpl = vi.fn();
    const out = await startCheckout(client, input, { ...on, secretKey: undefined }, fetchImpl);
    expect(out).toEqual({ ok: true, invoiceUrl: null, trialing: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("creates a session, attaches it and returns the payment link", async () => {
    rpc.mockResolvedValueOnce({ data: paidRow, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const fetchImpl = vi.fn().mockResolvedValue(session);
    const out = await startCheckout(client, input, on, fetchImpl);
    expect(out).toEqual({
      ok: true,
      invoiceUrl: "https://checkout.xendit.test/ps-1",
      trialing: false,
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.reference_id).toBe("LIN-INV-0001");
    expect(body.amount).toBe(499);
    expect(body.success_return_url).toBe("https://linara.test/billing/return?paid=1");
    expect(rpc).toHaveBeenLastCalledWith("attach_xendit_invoice", {
      p_invoice_id: "inv-1",
      p_xendit_id: "ps-1",
      p_url: "https://checkout.xendit.test/ps-1",
      p_expires_at: "2026-10-20T00:00:00.000Z",
    });
  });

  it("falls back to the login email when none is given", async () => {
    rpc.mockResolvedValueOnce({ data: paidRow, error: null });
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const fetchImpl = vi.fn().mockResolvedValue(session);
    await startCheckout(client, { ...input, email: "  " }, on, fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).customer.email).toBe("login@example.com");
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
  it("reuses a still-open payment link instead of creating a second session", async () => {
    rpc.mockResolvedValueOnce({ data: { ...paidRow, reused: true }, error: null });
    const single = {
      data: {
        payment_url: "https://checkout.xendit.test/old",
        expires_at: "2999-01-01T00:00:00.000Z",
        status: "pending",
      },
      error: null,
    };
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => single };
    from.mockReturnValueOnce(chain);
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
});
