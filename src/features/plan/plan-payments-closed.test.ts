import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Boundaries only: the server-function wrapper, the Supabase client, the
// locale cookie and the network. The handlers themselves are the real code.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      handler: (fn: (ctx: { data: unknown }) => unknown) => (ctx: { data: unknown }) => fn(ctx),
    };
    return builder;
  },
}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
  supabaseClient: {},
  createAuthedClient: vi.fn(() => ({ rpc })),
}));
vi.mock("@/lib/i18n/locale-cookie", () => ({ readLocale: () => "en" }));

import { loadMyBilling, startCheckoutFn, startTrialFn } from "./plan.actions";

const CLOSED =
  "Paid plans and add-ons aren't available yet. Your household keeps its current plan for now.";

const row = {
  subscription: {
    planId: "free",
    planVersion: 1,
    cycle: "monthly",
    addons: [],
    status: "active",
    cancelAtPeriodEnd: false,
    periodEnd: null,
  },
  limits: { households: 1, kasambahay: 1, co_managers: 0 },
  usage: { households: 1, kasambahay: 0, co_managers: 0 },
  selection: null,
  payments: [],
  catalog: { plans: [], addons: [], switches: {} },
  // The database says a trial could start.
  trialAvailable: true,
};
const owner = {
  rpc: vi.fn(async (fn: string) =>
    fn === "my_billing"
      ? { data: row, error: null }
      : { data: [{ household_id: "h1", role: "primary_manager", is_current: true }], error: null },
  ),
} as unknown as Parameters<typeof loadMyBilling>[0];

const checkoutInput = {
  token: "tok",
  kind: "plan" as const,
  planId: "normal",
  cycle: "monthly" as const,
  addons: [],
  returnUrl: "https://linara-delta.vercel.app",
};

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
  vi.stubGlobal("fetch", fetchSpy);
  rpc.mockReset();
  rpc.mockResolvedValue({ data: null, error: null });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("payments closed: BILLING_CHECKOUT is not on (production until Xendit is set up)", () => {
  it.each([undefined, "", "off", "ON", "true", "1", " on"])(
    "BILLING_CHECKOUT=%j keeps payments closed and hides a trial the database would allow",
    async (value) => {
      if (value === undefined) vi.stubEnv("BILLING_CHECKOUT", undefined as unknown as string);
      else vi.stubEnv("BILLING_CHECKOUT", value);
      const res = await loadMyBilling(owner);
      expect(res.missing).toBe(false);
      if (res.missing) return;
      expect(res.billing.paymentsOpen).toBe(false);
      expect(res.billing.trialAvailable).toBe(false);
    },
  );

  it("checkout refuses in plain words and never calls the payment function", async () => {
    vi.stubEnv("BILLING_CHECKOUT", "");
    const res = await startCheckoutFn({ data: checkoutInput });
    expect(res).toEqual({ ok: false, message: CLOSED });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("checkout for add-ons is refused the same way", async () => {
    vi.stubEnv("BILLING_CHECKOUT", "off");
    const res = await startCheckoutFn({
      data: {
        ...checkoutInput,
        kind: "addons",
        planId: null,
        addons: [{ addonId: "extra_kasambahay", quantity: 1 }],
      },
    });
    expect(res).toEqual({ ok: false, message: CLOSED });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("a trial is refused before the database is asked", async () => {
    vi.stubEnv("BILLING_CHECKOUT", "");
    const res = await startTrialFn({ data: { token: "tok", planId: "normal" } });
    expect(res).toEqual({ ok: false, message: CLOSED });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("payments open: BILLING_CHECKOUT=on (dev and previews)", () => {
  beforeEach(() => vi.stubEnv("BILLING_CHECKOUT", "on"));

  it("the plan says payments are open and passes the database's trial through", async () => {
    const res = await loadMyBilling(owner);
    if (res.missing) throw new Error("expected billing");
    expect(res.billing.paymentsOpen).toBe(true);
    expect(res.billing.trialAvailable).toBe(true);
  });

  it("checkout reaches the payment function", async () => {
    await startCheckoutFn({ data: checkoutInput });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/functions\/v1\/billing-checkout$/);
  });

  it("a trial reaches the database", async () => {
    await startTrialFn({ data: { token: "tok", planId: "normal" } });
    expect(rpc).toHaveBeenCalledWith("billing_start_trial", { p_plan_id: "normal" });
  });
});
