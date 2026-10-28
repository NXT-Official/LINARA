// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addonChange, limitsFor } from "./plan.logic";
import { SAMPLE_SUBSCRIPTION } from "./plan.sample";
import {
  changePlan,
  getPlanState,
  payForAddons,
  previewStatus,
  PROCESSING_MS,
  removeAddons,
  resetPlan,
} from "./plan.store";
import type { MySubscription } from "./plan.types";

const sub = (change: Partial<MySubscription> = {}): MySubscription => ({
  ...SAMPLE_SUBSCRIPTION,
  planId: "normal",
  ...change,
});
const kasambahay = (quantity: number) => [{ addonId: "extra_kasambahay", quantity }];

async function buy(lines: { addonId: string; quantity: number }[], method = "gcash" as const) {
  const p = payForAddons(lines, method);
  await vi.advanceTimersByTimeAsync(PROCESSING_MS);
  return p;
}

beforeEach(() => {
  vi.useFakeTimers();
  changePlan("normal", "monthly", []);
});
afterEach(() => {
  resetPlan();
  vi.useRealTimers();
});

describe("addonChange", () => {
  it("charges the added add-ons for the period: a month's price, a year's on yearly", () => {
    expect(addonChange(sub(), kasambahay(2))).toEqual({
      ok: true,
      dueNow: 10_000,
      newAmount: 29_900,
    });
    expect(addonChange(sub({ cycle: "annual" }), kasambahay(1))).toEqual({
      ok: true,
      dueNow: 60_000,
      newAmount: 259_000,
    });
  });

  it("charges only what's added on top of what it has, and nothing for removing", () => {
    const has = sub({ addons: kasambahay(2) });
    expect(addonChange(has, kasambahay(3))).toMatchObject({ dueNow: 5_000 });
    expect(addonChange(has, kasambahay(1))).toMatchObject({ ok: true, dueNow: 0 });
    expect(addonChange(has, [])).toMatchObject({ ok: true, dueNow: 0, newAmount: 19_900 });
  });

  it("refuses Free, a one-time plan, a payment owed, no change, and bad quantities", () => {
    const msg = (r: ReturnType<typeof addonChange>) => (r.ok ? "ok" : r.message);
    expect(msg(addonChange(sub({ planId: "free" }), kasambahay(1)))).toMatch(
      /paid monthly or yearly/,
    );
    expect(msg(addonChange(sub({ status: "past_due" }), kasambahay(1)))).toMatch(/Pay what's owed/);
    expect(msg(addonChange(sub({ status: "restricted" }), kasambahay(1)))).toMatch(
      /Pay what's owed/,
    );
    expect(msg(addonChange(sub(), []))).toBe("Nothing changed.");
    expect(msg(addonChange(sub({ addons: kasambahay(1) }), kasambahay(1)))).toBe(
      "Nothing changed.",
    );
    for (const q of [-1, 11, 1.5, Number.NaN]) {
      expect(addonChange(sub(), kasambahay(q)).ok, String(q)).toBe(false);
    }
    expect(addonChange(sub(), [{ addonId: "extra_unicorn", quantity: 1 }]).ok).toBe(false);
  });
});

describe("buying add-ons (sample)", () => {
  it("raises the limit, keeps the plan and renewal date, and records an add-ons payment", async () => {
    const before = getPlanState().subscription;
    const res = await buy(kasambahay(2));
    expect(res.ok).toBe(true);
    const after = getPlanState().subscription;
    expect(after).toMatchObject({ planId: "normal", periodEnd: before.periodEnd });
    expect(limitsFor(after).kasambahay).toBe(5);
    expect(getPlanState().payments[0]).toMatchObject({
      kind: "addons",
      amount: 10_000,
      status: "paid",
    });
  });

  it("the test card declines: nothing changes but the history", async () => {
    const res = await buy(kasambahay(1), "card_decline" as never);
    expect(res).toMatchObject({ ok: false });
    expect(getPlanState().subscription.addons).toEqual([]);
    expect(getPlanState().payments[0]).toMatchObject({ kind: "addons", status: "failed" });
  });

  it("two purchases at once: the second is refused, not charged twice", async () => {
    const first = payForAddons(kasambahay(1), "gcash");
    expect(await payForAddons(kasambahay(1), "gcash")).toEqual({
      ok: false,
      message: "A payment is already going through.",
    });
    await vi.advanceTimersByTimeAsync(PROCESSING_MS);
    expect((await first).ok).toBe(true);
    expect(getPlanState().payments).toHaveLength(1);
  });

  it("refuses paying for a removal, or while a payment is owed", async () => {
    await buy(kasambahay(2));
    expect(await payForAddons(kasambahay(1), "gcash")).toEqual({
      ok: false,
      message: "Nothing to pay for this change.",
    });
    previewStatus("past_due");
    expect(await payForAddons(kasambahay(3), "gcash")).toMatchObject({ ok: false });
  });

  it("refuses an unknown payment method", async () => {
    expect(await payForAddons(kasambahay(1), "bitcoin" as never)).toEqual({
      ok: false,
      message: "Choose how to pay.",
    });
  });
});

describe("removing add-ons", () => {
  it("applies without paying, and won't sneak in an addition", async () => {
    await buy(kasambahay(2));
    expect(removeAddons(kasambahay(1))).toEqual({ ok: true });
    expect(limitsFor(getPlanState().subscription).kasambahay).toBe(4);
    expect(removeAddons(kasambahay(3))).toMatchObject({ ok: false });
    expect(getPlanState().payments).toHaveLength(1);
  });
});
