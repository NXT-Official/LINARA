import { afterEach, describe, expect, it } from "vitest";

import {
  canAdd,
  checkSelection,
  formatCentavos,
  graceEndsAt,
  hasFeature,
  limitsFor,
  overLimits,
  priceText,
  quote,
} from "./plan.logic";
import { ADDONS, CATALOG, SAMPLE_SUBSCRIPTION } from "./plan.sample";
import { changePlan, previewStatus, resetPlan, saveSelection } from "./plan.store";
import type { MySubscription, Usage } from "./plan.types";

const sub = (change: Partial<MySubscription> = {}): MySubscription => ({
  ...SAMPLE_SUBSCRIPTION,
  ...change,
});
const free = sub({ planId: "free", periodEnd: null });
const usage = (households: number, kasambahay: number, co_managers: number): Usage => ({
  households,
  kasambahay,
  co_managers,
});

describe("the sample catalog mirrors the console's", () => {
  it("has Free, Normal and Premium at the same placeholder prices and limits", () => {
    expect(CATALOG.map((p) => [p.id, p.prices.monthly, p.prices.annual])).toEqual([
      ["free", 0, null],
      ["normal", 19_900, 199_000],
      ["premium", 39_900, 399_000],
    ]);
    expect(CATALOG.find((p) => p.id === "normal")?.limits).toEqual({
      households: 1,
      kasambahay: 3,
      co_managers: 1,
    });
    expect(ADDONS.map((a) => a.monthlyPrice)).toEqual([10_000, 5_000]);
  });

  it("starts on Premium so nothing the app has today is locked in the preview", () => {
    expect(SAMPLE_SUBSCRIPTION.planId).toBe("premium");
    for (const key of ["pantry", "time_off", "after_hours", "remote_admin"] as const) {
      expect(hasFeature(SAMPLE_SUBSCRIPTION, key)).toBe(true);
    }
  });
});

describe("features", () => {
  it("Free doesn't include pantry; Staff pay & HR is off for everyone, even on Premium", () => {
    expect(hasFeature(free, "tasks")).toBe(true);
    expect(hasFeature(free, "pantry")).toBe(false);
    expect(hasFeature(SAMPLE_SUBSCRIPTION, "staff_pay_hr")).toBe(false);
  });

  it("a kasambahay's leave, rest owed and record are on every plan, even an unknown one (RA 10361)", () => {
    for (const s of [free, SAMPLE_SUBSCRIPTION, sub({ planId: "gone" })]) {
      for (const key of ["time_off", "after_hours", "work_record"] as const) {
        expect(hasFeature(s, key), `${s.planId} ${key}`).toBe(true);
      }
    }
    for (const p of CATALOG) {
      expect(p.features.time_off && p.features.after_hours && p.features.work_record, p.id).toBe(
        true,
      );
    }
  });

  it("an unknown plan unlocks nothing beyond what's on every plan", () => {
    expect(hasFeature(sub({ planId: "gone" }), "tasks")).toBe(false);
    expect(hasFeature(sub({ planId: "gone" }), "pantry")).toBe(false);
  });
});

describe("limits", () => {
  it("add-ons raise a limit; unlimited stays unlimited", () => {
    expect(
      limitsFor(sub({ planId: "normal", addons: [{ addonId: "extra_kasambahay", quantity: 2 }] })),
    ).toEqual({ households: 1, kasambahay: 5, co_managers: 1 });
    expect(
      limitsFor(sub({ addons: [{ addonId: "extra_kasambahay", quantity: 3 }] })).kasambahay,
    ).toBeNull();
  });

  it("ignores unknown, zero and negative add-on lines", () => {
    expect(
      limitsFor(
        sub({
          planId: "normal",
          addons: [
            { addonId: "nope", quantity: 5 },
            { addonId: "extra_household", quantity: 0 },
            { addonId: "extra_household", quantity: -3 },
          ],
        }),
      ),
    ).toEqual({ households: 1, kasambahay: 3, co_managers: 1 });
  });

  it("allows up to the limit and not one more", () => {
    expect(canAdd(free, usage(1, 0, 0), "kasambahay")).toEqual({ ok: true });
    const full = canAdd(free, usage(1, 1, 0), "kasambahay");
    expect(full).toMatchObject({ ok: false, reason: "limit" });
    expect(!full.ok && full.message).toBe("Free allows 1 kasambahay, and you have 1.");
    const none = canAdd(free, usage(1, 0, 0), "co_managers");
    expect(!none.ok && none.message).toBe("Free doesn't include co-managers.");
    expect(canAdd(SAMPLE_SUBSCRIPTION, usage(1, 40, 0), "kasambahay")).toEqual({ ok: true });
  });

  it("a restricted plan adds nothing, even under the limit", () => {
    expect(canAdd(sub({ status: "restricted" }), usage(1, 0, 0), "kasambahay")).toMatchObject({
      ok: false,
      reason: "restricted",
    });
  });

  it("names the limits that are over, not the ones that are full", () => {
    expect(overLimits(free, usage(2, 1, 0))).toEqual(["households"]);
    expect(overLimits(free, usage(1, 1, 0))).toEqual([]);
    expect(overLimits(free, usage(3, 4, 2))).toEqual(["households", "kasambahay", "co_managers"]);
  });
});

describe("grace", () => {
  it("ends 7 days after the period when a renewal failed, and not otherwise", () => {
    expect(graceEndsAt(sub({ status: "past_due", periodEnd: "2026-10-28T00:00:00.000Z" }))).toBe(
      "2026-11-04T00:00:00.000Z",
    );
    expect(graceEndsAt(SAMPLE_SUBSCRIPTION)).toBeNull();
    expect(graceEndsAt(sub({ status: "past_due", periodEnd: null }))).toBeNull();
  });
});

describe("choosing what stays active", () => {
  const available = { households: ["h1", "h2"], kasambahay: ["k1", "k2", "k3"] };

  it("accepts a choice within the plan", () => {
    expect(checkSelection(free, { households: ["h1"], kasambahay: ["k2"] }, available)).toEqual({
      ok: true,
    });
  });

  it("refuses too many, none, duplicates and ids that aren't there", () => {
    const msg = (s: { households: string[]; kasambahay: string[] }) => {
      const r = checkSelection(free, s, available);
      return r.ok ? "ok" : r.message;
    };
    expect(msg({ households: ["h1", "h2"], kasambahay: [] })).toMatch(/up to 1 household/);
    expect(msg({ households: ["h1"], kasambahay: ["k1", "k2"] })).toMatch(/up to 1 kasambahay/);
    expect(msg({ households: [], kasambahay: [] })).toMatch(/at least one household/);
    expect(msg({ households: ["h1", "h1"], kasambahay: [] })).toMatch(/twice/);
    expect(msg({ households: ["h9"], kasambahay: [] })).toMatch(/isn't there/);
  });
});

describe("quote", () => {
  it("prices add-ons a month, twelve on a yearly plan", () => {
    expect(quote("normal", "monthly", [{ addonId: "extra_kasambahay", quantity: 2 }])).toEqual({
      ok: true,
      amount: 29_900,
    });
    expect(quote("normal", "annual", [{ addonId: "extra_kasambahay", quantity: 1 }])).toEqual({
      ok: true,
      amount: 259_000,
    });
  });

  it("refuses what can't be sold", () => {
    expect(quote("gone", "monthly", []).ok).toBe(false);
    expect(quote("normal", "one_time", []).ok).toBe(false);
    expect(quote("free", "monthly", [{ addonId: "extra_household", quantity: 1 }]).ok).toBe(false);
    for (const quantity of [-1, 11, 1.5, Number.NaN]) {
      expect(quote("normal", "monthly", [{ addonId: "extra_household", quantity }]).ok).toBe(false);
    }
  });

  it("formats prices plainly", () => {
    expect(formatCentavos(19_900)).toBe("₱199");
    expect(formatCentavos(129_950)).toBe("₱1,299.50");
    expect(priceText(0, "monthly")).toBe("Free");
    expect(priceText(399_000, "annual")).toBe("₱3,990 a year");
  });
});

describe("the sample store", () => {
  afterEach(resetPlan);

  it("changes plan, and refuses the same plan twice (a double tap)", () => {
    expect(changePlan("normal", "monthly", [])).toEqual({ ok: true });
    expect(changePlan("normal", "monthly", [])).toMatchObject({ ok: false });
  });

  it("paying from a restricted plan reactivates it, even on the same plan", () => {
    previewStatus("restricted");
    expect(changePlan("premium", "monthly", [])).toEqual({ ok: true });
  });

  it("won't save a selection over the limit", () => {
    expect(changePlan("free", "monthly", [])).toEqual({ ok: true });
    expect(
      saveSelection(
        { households: ["h1"], kasambahay: ["k1", "k2"] },
        { households: ["h1"], kasambahay: ["k1", "k2"] },
      ).ok,
    ).toBe(false);
  });
});
