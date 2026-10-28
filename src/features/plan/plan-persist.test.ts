// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A fresh copy of the store, as after a page load (switching household reloads the page). */
async function freshStore() {
  vi.resetModules();
  return import("./plan.store");
}

const KEY = (uid: string) => `linara_plan_preview:${uid}`;

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the sample plan is kept per manager account", () => {
  it("survives a page load, such as switching household", async () => {
    let store = await freshStore();
    store.loadPlanFor("u1");
    expect(store.changePlan("free", "monthly", [])).toEqual({ ok: true });

    store = await freshStore();
    store.loadPlanFor("u1");
    expect(store.getPlanState().subscription.planId).toBe("free");
  });

  it("keeps payments and what stays active too", async () => {
    let store = await freshStore();
    store.loadPlanFor("u1");
    const paying = store.payForPlan("normal", "monthly", [], "maya");
    await vi.advanceTimersByTimeAsync(store.PROCESSING_MS);
    expect((await paying).ok).toBe(true);
    store.previewStatus("restricted");
    expect(
      store.saveSelection(
        { households: ["h1"], kasambahay: ["k1"] },
        { households: ["h1"], kasambahay: ["k1"] },
      ).ok,
    ).toBe(true);

    store = await freshStore();
    store.loadPlanFor("u1");
    const s = store.getPlanState();
    expect(s.subscription).toMatchObject({ planId: "normal", status: "restricted" });
    expect(s.payments.map((p) => p.method)).toEqual(["maya"]);
    expect(s.selection).toEqual({ households: ["h1"], kasambahay: ["k1"] });
  });

  it("another account on the same browser doesn't see it", async () => {
    let store = await freshStore();
    store.loadPlanFor("u1");
    store.changePlan("free", "monthly", []);

    store = await freshStore();
    store.loadPlanFor("u2");
    expect(store.getPlanState().subscription.planId).toBe("premium");
  });

  it("switching account in the same page swaps plans, and signing out shows the sample", async () => {
    const store = await freshStore();
    store.loadPlanFor("u1");
    store.changePlan("free", "monthly", []);
    store.loadPlanFor("u2");
    expect(store.getPlanState().subscription.planId).toBe("premium");
    store.loadPlanFor("u1");
    expect(store.getPlanState().subscription.planId).toBe("free");
    store.loadPlanFor(null);
    expect(store.getPlanState().subscription.planId).toBe("premium");
  });

  it("falls back to the sample when what's saved is broken or tampered with", async () => {
    const bad = [
      "not json",
      "null",
      "[]",
      JSON.stringify({ subscription: { planId: "gold", cycle: "monthly" } }),
      JSON.stringify({
        subscription: {
          ...{ planId: "free", planVersion: 1, cycle: "weekly", addons: [], status: "active" },
        },
      }),
      JSON.stringify({
        subscription: {
          planId: "normal",
          planVersion: 1,
          cycle: "monthly",
          addons: [{ addonId: "extra_kasambahay", quantity: 999 }],
          status: "active",
          cancelAtPeriodEnd: false,
          periodEnd: null,
        },
        selection: null,
        payments: [],
      }),
      JSON.stringify({
        subscription: {
          planId: "normal",
          planVersion: 1,
          cycle: "monthly",
          addons: [],
          status: "hacked",
          cancelAtPeriodEnd: false,
          periodEnd: null,
        },
        selection: null,
        payments: [],
      }),
    ];
    for (const value of bad) {
      window.localStorage.setItem(KEY("u1"), value);
      const store = await freshStore();
      store.loadPlanFor("u1");
      expect(store.getPlanState().subscription.planId, value).toBe("premium");
    }
  });

  it("still works when storage refuses to be read or written", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const store = await freshStore();
    expect(() => store.loadPlanFor("u1")).not.toThrow();
    expect(store.changePlan("free", "monthly", [])).toEqual({ ok: true });
    expect(store.getPlanState().subscription.planId).toBe("free");
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("Reset preview forgets the saved plan", async () => {
    let store = await freshStore();
    store.loadPlanFor("u1");
    store.changePlan("free", "monthly", []);
    store.resetPlan();

    store = await freshStore();
    store.loadPlanFor("u1");
    expect(store.getPlanState().subscription.planId).toBe("premium");
  });
});
