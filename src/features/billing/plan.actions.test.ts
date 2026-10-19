import { beforeEach, describe, expect, it, vi } from "vitest";

const anonRpc = vi.hoisted(() => vi.fn());
const authedRpc = vi.hoisted(() => vi.fn());
const anonFrom = vi.hoisted(() => vi.fn());
const authedFrom = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabaseClient: { rpc: anonRpc, from: anonFrom },
  createAuthedClient: () => ({ rpc: authedRpc, from: authedFrom }),
}));

import { createAuthedClient } from "@/lib/supabase";

import * as planActions from "./plan.actions";
import { getPlatformSettings, listPublicPlans } from "./plan.actions";

const planRow = (over: Record<string, unknown> = {}) => ({
  id: "plan-1",
  name: "Family",
  tagline: "For one home",
  inclusions: ["Tasks", "Payroll"],
  interval: "monthly",
  base_centavos: "49900",
  included_helpers: 2,
  included_managers: null,
  included_homes: 1,
  extra_helper_centavos: "9900",
  extra_manager_centavos: null,
  extra_home_centavos: null,
  trial_days: 14,
  is_public: true,
  status: "active",
  sort_order: 1,
  ...over,
});

beforeEach(() => {
  anonRpc.mockReset();
  authedRpc.mockReset();
  anonFrom.mockReset();
  authedFrom.mockReset();
});

describe("plan.actions exports", () => {
  it("keeps only the public reads: plan writes live in the Linara console", () => {
    expect(Object.keys(planActions).sort()).toEqual(
      [
        "getPlatformSettings",
        "getPlatformSettingsFn",
        "listPublicPlans",
        "listPublicPlansFn",
      ].sort(),
    );
  });
});

describe("listPublicPlans", () => {
  it("asks billing_public_plans on the anon client and maps each row", async () => {
    anonRpc.mockResolvedValueOnce({ data: [planRow()], error: null });
    const out = await listPublicPlans();
    expect(anonRpc).toHaveBeenCalledWith("billing_public_plans");
    expect(anonFrom).not.toHaveBeenCalled();
    expect(out).toEqual({
      available: true,
      plans: [
        {
          id: "plan-1",
          name: "Family",
          tagline: "For one home",
          inclusions: ["Tasks", "Payroll"],
          interval: "monthly",
          baseCentavos: 49900,
          includedHelpers: 2,
          includedManagers: null,
          includedHomes: 1,
          extraHelperCentavos: 9900,
          extraManagerCentavos: null,
          extraHomeCentavos: null,
          trialDays: 14,
          isPublic: true,
          status: "active",
          sortOrder: 1,
        },
      ],
    });
  });

  it("orders by sort order, then price, whatever order the reply has", async () => {
    anonRpc.mockResolvedValueOnce({
      data: [
        planRow({ id: "c", sort_order: 2, base_centavos: 100 }),
        planRow({ id: "b", sort_order: 1, base_centavos: 900 }),
        planRow({ id: "a", sort_order: 1, base_centavos: 500 }),
      ],
      error: null,
    });
    const out = await listPublicPlans();
    expect(out.plans.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("says unavailable when the function is missing", async () => {
    anonRpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "x" } });
    expect(await listPublicPlans()).toEqual({ available: false, plans: [] });
  });

  it("reads a null reply as no plans published", async () => {
    anonRpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await listPublicPlans()).toEqual({ available: true, plans: [] });
  });

  it("throws on any other error, which the /pricing loader turns into no plans", async () => {
    anonRpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(listPublicPlans()).rejects.toThrow(/boom/);
  });
});

describe("getPlatformSettings", () => {
  const authed = () => createAuthedClient("t");

  it("asks billing_settings_public on the signed-in client and maps it", async () => {
    authedRpc.mockResolvedValueOnce({
      data: {
        free_tier_enabled: true,
        free_helper_seats: 1,
        free_manager_seats: null,
        support_email: "help@linara.test",
      },
      error: null,
    });
    const out = await getPlatformSettings(authed());
    expect(authedRpc).toHaveBeenCalledWith("billing_settings_public");
    expect(authedFrom).not.toHaveBeenCalled();
    expect(out).toEqual({
      available: true,
      settings: {
        freeTierEnabled: true,
        freeHelperSeats: 1,
        freeManagerSeats: null,
        supportEmail: "help@linara.test",
      },
    });
  });

  it("says unavailable when the function is missing", async () => {
    authedRpc.mockResolvedValueOnce({ data: null, error: { code: "42883", message: "x" } });
    expect(await getPlatformSettings(authed())).toEqual({ available: false, settings: null });
  });

  it("reads a null reply as no settings", async () => {
    authedRpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await getPlatformSettings(authed())).toEqual({ available: true, settings: null });
  });

  it("throws on any other error", async () => {
    authedRpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    await expect(getPlatformSettings(authed())).rejects.toThrow(/boom/);
  });
});
