import { describe, expect, it } from "vitest";

import { MIN_CHARGE, planMove } from "./plan.logic";
import type { MySubscription } from "./plan.types";

// The same cases as supabase/tests/billing-plan-changes.test.mjs, so the
// price the dialog shows is the one the database charges.
const DAY = 86_400_000;
const NOW = Date.parse("2026-11-08T00:00:00.000Z");
const running = (change: Partial<MySubscription> = {}): MySubscription => ({
  planId: "normal",
  planVersion: 1,
  cycle: "monthly",
  addons: [],
  status: "active",
  cancelAtPeriodEnd: false,
  // 20 of 30 days left.
  periodStart: new Date(NOW - 10 * DAY).toISOString(),
  periodEnd: new Date(NOW + 20 * DAY).toISOString(),
  ...change,
});

describe("moving up while a paid period runs", () => {
  it("a higher plan pays the gap for the time left and keeps the renewal date", () => {
    // (39900 - 19900) x 20/30 = 13333.33, rounded up.
    expect(planMove(running(), "premium", "monthly", [], NOW)).toEqual({
      ok: true,
      dueNow: 13_334,
      keepsPeriod: true,
      prorated: true,
    });
  });

  it("monthly to yearly pays the year less the unused part of the month, from today", () => {
    // 199000 - floor(19900 x 20/30 = 13266.67) = 185734.
    expect(planMove(running(), "normal", "annual", [], NOW)).toEqual({
      ok: true,
      dueNow: 185_734,
      keepsPeriod: false,
      prorated: true,
    });
    expect(planMove(running(), "premium", "annual", [], NOW)).toMatchObject({
      ok: true,
      dueNow: 385_734,
    });
  });

  it("never less than Xendit's card minimum, even in the last hour", () => {
    const sub = running({
      periodStart: new Date(NOW - 30 * DAY + 3_600_000).toISOString(),
      periodEnd: new Date(NOW + 3_600_000).toISOString(),
    });
    expect(planMove(sub, "premium", "monthly", [], NOW)).toMatchObject({
      ok: true,
      dueNow: MIN_CHARGE,
    });
    expect(MIN_CHARGE).toBe(2_000);
  });

  it("a cancelled plan can still move up", () => {
    expect(
      planMove(running({ cancelAtPeriodEnd: true }), "premium", "monthly", [], NOW),
    ).toMatchObject({ ok: true, keepsPeriod: true });
  });

  it("without a known period start, it charges the whole gap", () => {
    expect(
      planMove(running({ periodStart: undefined }), "premium", "monthly", [], NOW),
    ).toMatchObject({ ok: true, dueNow: 20_000 });
  });
});

describe("moving down while a paid period runs", () => {
  const premium = running({ planId: "premium" });

  it.each([
    ["a cheaper plan", "normal", "monthly"],
    ["Free", "free", "monthly"],
  ] as const)("%s is refused, pointing at cancel and the date it ends", (_, planId, cycle) => {
    expect(planMove(premium, planId, cycle, [], NOW)).toEqual({
      ok: false,
      lower: true,
      message:
        "To move to a lower plan, cancel this one. You keep it until Nov 28, 2026, then choose again.",
    });
  });

  it("yearly to monthly is a move down, even on the same plan", () => {
    const yearly = running({ planId: "premium", cycle: "annual" });
    expect(planMove(yearly, "premium", "monthly", [], NOW)).toMatchObject({
      ok: false,
      lower: true,
    });
    expect(planMove(yearly, "normal", "annual", [], NOW)).toMatchObject({ ok: false, lower: true });
  });

  it("the same plan is refused; add-ons are changed through Add-ons", () => {
    expect(planMove(running(), "normal", "monthly", [], NOW)).toEqual({
      ok: false,
      message: "That's the plan you already have.",
    });
    expect(
      planMove(running(), "normal", "monthly", [{ addonId: "extra_household", quantity: 1 }], NOW),
    ).toEqual({ ok: false, message: "To change add-ons, use Add-ons on Your plan." });
  });

  it("a higher plan for no more than the plan and add-ons now: remove the add-ons first", () => {
    const withAddons = running({ addons: [{ addonId: "extra_household", quantity: 2 }] });
    expect(planMove(withAddons, "premium", "monthly", [], NOW)).toEqual({
      ok: false,
      message:
        "That costs no more than what you pay now. Remove the add-ons you won't need first, then upgrade.",
    });
  });
});

describe("when no paid period runs, any plan at its full price", () => {
  it("from Free", () => {
    const free = running({ planId: "free", periodStart: null, periodEnd: null });
    expect(planMove(free, "normal", "monthly", [], NOW)).toEqual({
      ok: true,
      dueNow: 19_900,
      keepsPeriod: false,
      prorated: false,
    });
    expect(planMove(free, "free", "monthly", [], NOW)).toMatchObject({
      ok: false,
      message: "That's the plan you already have.",
    });
  });

  it("past due: a lower plan, the same plan (what's owed) or Free", () => {
    const owed = running({
      planId: "premium",
      status: "past_due",
      periodStart: new Date(NOW - 32 * DAY).toISOString(),
      periodEnd: new Date(NOW - 2 * DAY).toISOString(),
    });
    expect(planMove(owed, "normal", "monthly", [], NOW)).toMatchObject({
      ok: true,
      dueNow: 19_900,
    });
    expect(planMove(owed, "premium", "monthly", [], NOW)).toMatchObject({
      ok: true,
      dueNow: 39_900,
    });
    expect(planMove(owed, "free", "monthly", [], NOW)).toMatchObject({ ok: true, dueNow: 0 });
  });

  it("in a trial nothing was paid, so Free is allowed", () => {
    expect(
      planMove(running({ planId: "premium", status: "trialing" }), "free", "monthly", [], NOW),
    ).toMatchObject({ ok: true, dueNow: 0 });
  });
});
