import { describe, expect, it, vi } from "vitest";

// The Supabase client is the network boundary; each test hands in its own.
vi.mock("@/lib/supabase", () => ({ supabaseClient: {}, createAuthedClient: vi.fn() }));

import { loadMyBilling } from "./plan.actions";

type Reply = { data: unknown; error: { code?: string; message: string } | null };

const premium = {
  planId: "premium",
  planVersion: 1,
  cycle: "monthly",
  addons: [],
  status: "active",
  cancelAtPeriodEnd: false,
  periodEnd: "2026-11-26T02:00:00.000Z",
};
const free = { ...premium, planId: "free", periodEnd: null };
const catalog = { plans: [], addons: [], switches: { staff_pay_hr: false } };

const myBilling: Reply = {
  data: {
    subscription: premium,
    limits: { households: 3, kasambahay: null, co_managers: 3 },
    usage: { households: 1, kasambahay: 1, co_managers: 0 },
    selection: null,
    payments: [],
    catalog,
  },
  error: null,
};
const notPrimary: Reply = {
  data: null,
  error: { code: "P0001", message: "Only a household's primary manager manages its plan." },
};
const householdPlan: Reply = {
  data: { subscription: free, limits: { households: 1, kasambahay: 1, co_managers: 0 } },
  error: null,
};
const households = (rows: { role: string; is_current: boolean }[]): Reply => ({
  data: rows.map((r, i) => ({ household_id: `h${i}`, name: `H${i}`, ...r })),
  error: null,
});
const missing = (fn: string): Reply => ({
  data: null,
  error: { code: "PGRST202", message: `Could not find the function public.${fn}` },
});

/** A client answering each rpc by name; anything else is a test bug. */
function client(replies: Record<string, Reply>) {
  const rpc = vi.fn(async (fn: string) => {
    if (!(fn in replies)) throw new Error(`unexpected rpc ${fn}`);
    return replies[fn];
  });
  return { rpc } as unknown as Parameters<typeof loadMyBilling>[0];
}

describe("which plan a manager sees, for the household they're in", () => {
  it("their own, to manage, in a household they're primary manager of", async () => {
    const res = await loadMyBilling(
      client({
        my_billing: myBilling,
        my_households: households([{ role: "primary_manager", is_current: true }]),
      }),
    );
    expect(res).toMatchObject({ missing: false, billing: { owner: true } });
    expect(!res.missing && res.billing.subscription.planId).toBe("premium");
  });

  it("the household's owner's, read-only, where they're only a co-manager (even if they own another)", async () => {
    const res = await loadMyBilling(
      client({
        my_billing: myBilling,
        my_households: households([
          { role: "primary_manager", is_current: false },
          { role: "co_manager", is_current: true },
        ]),
        my_household_plan: householdPlan,
        billing_catalog: { data: catalog, error: null },
      }),
    );
    expect(res).toMatchObject({ missing: false, billing: { owner: false, usage: null } });
    // Their own Premium must not unlock this household's features or limits.
    expect(!res.missing && res.billing.subscription.planId).toBe("free");
    expect(!res.missing && res.billing.limits).toEqual({
      households: 1,
      kasambahay: 1,
      co_managers: 0,
    });
    expect(!res.missing && res.billing.payments).toEqual([]);
  });

  it("the same for a remote admin who owns a household elsewhere", async () => {
    const res = await loadMyBilling(
      client({
        my_billing: myBilling,
        my_households: households([
          { role: "remote_admin", is_current: true },
          { role: "primary_manager", is_current: false },
        ]),
        my_household_plan: householdPlan,
        billing_catalog: { data: catalog, error: null },
      }),
    );
    expect(!res.missing && res.billing.owner).toBe(false);
    expect(!res.missing && res.billing.subscription.planId).toBe("free");
  });

  it("the owner's for someone who owns no household at all", async () => {
    const res = await loadMyBilling(
      client({
        my_billing: notPrimary,
        my_household_plan: householdPlan,
        billing_catalog: { data: catalog, error: null },
      }),
    );
    expect(!res.missing && res.billing.owner).toBe(false);
    expect(!res.missing && res.billing.subscription.planId).toBe("free");
  });

  it("fails loudly when it can't tell which household they're in, never guessing it's theirs", async () => {
    await expect(
      loadMyBilling(
        client({
          my_billing: myBilling,
          my_households: { data: null, error: { message: "network down" } },
        }),
      ),
    ).rejects.toThrow(/network down/);
  });

  it("treats no current household as not theirs", async () => {
    const res = await loadMyBilling(
      client({
        my_billing: myBilling,
        my_households: households([{ role: "primary_manager", is_current: false }]),
        my_household_plan: householdPlan,
        billing_catalog: { data: catalog, error: null },
      }),
    );
    expect(!res.missing && res.billing.owner).toBe(false);
  });

  it("keeps the old behaviour where households aren't listed yet (before add-household-managers.sql)", async () => {
    const res = await loadMyBilling(
      client({ my_billing: myBilling, my_households: missing("my_households") }),
    );
    expect(!res.missing && res.billing.owner).toBe(true);
  });

  it("is missing before billing is set up", async () => {
    expect(await loadMyBilling(client({ my_billing: missing("my_billing") }))).toEqual({
      missing: true,
    });
  });
});
