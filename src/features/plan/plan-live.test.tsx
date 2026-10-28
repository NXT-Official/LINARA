// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingPayment, MyBilling } from "./plan.actions";

// Only the server is mocked: the store, the plan rules and the screens are real.
const server = vi.hoisted(() => ({
  getMyBillingFn: vi.fn(),
  startCheckoutFn: vi.fn(),
  changeToFreeFn: vi.fn(),
  removeAddonsFn: vi.fn(),
  saveSelectionFn: vi.fn(),
  getCatalogFn: vi.fn(),
}));
vi.mock("./plan.actions", () => server);
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/features/dashboard/app-store-context", () => ({
  useAppStores: () => ({
    session: {
      households: [{ id: "h1", name: "Santos home", role: "primary_manager", isCurrent: true }],
      admins: [{ id: "a1", type: "primary" }],
    },
    invites: { invites: [] },
  }),
}));
vi.mock("@/lib/mobile-app", () => ({ inMobileApp: () => false }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { MyPlanPage } from "./pages/my-plan-page";
import { CATALOG, setCatalog } from "./plan.sample";
import {
  changePlan,
  checkout,
  connectPlan,
  getPlanState,
  loadPlanFor,
  payForPlan,
  previewStatus,
} from "./plan.store";

const plan = (id: string, monthly: number) => ({
  ...CATALOG.find((p) => p.id === id)!,
  prices: { monthly, annual: monthly * 10, one_time: null },
  pricePlaceholder: false,
});

function billing(over: Partial<MyBilling> = {}): MyBilling {
  return {
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
    usage: { households: 2, kasambahay: 5, co_managers: 0 },
    selection: null,
    payments: [],
    catalog: {
      plans: [plan("free", 0), plan("normal", 25_000), plan("premium", 49_900)],
      addons: [
        {
          id: "extra_kasambahay",
          name: "Extra kasambahay",
          limitKey: "kasambahay",
          step: 1,
          monthlyPrice: 7_500,
        },
      ],
      switches: { staff_pay_hr: false },
    },
    testMode: true,
    owner: true,
    ...over,
  };
}

const payment = (over: Partial<BillingPayment>): BillingPayment => ({
  id: "6f1c1b0e-0000-4000-8000-000000000001",
  kind: "plan",
  reference: "inv_1",
  planId: "normal",
  cycle: "monthly",
  amount: 25_000,
  method: null,
  status: "pending",
  at: "2026-10-28T01:00:00.000Z",
  paidAt: null,
  failureReason: null,
  invoiceUrl: "https://checkout-staging.xendit.co/web/inv_1",
  ...over,
});

const goLive = async (b: MyBilling = billing()) => {
  server.getMyBillingFn.mockResolvedValue({ missing: false, billing: b });
  await act(async () => {
    await connectPlan("u1", "token-1");
  });
};

let assign: ReturnType<typeof vi.fn>;
beforeEach(() => {
  assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign, origin: "https://linara.test" },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  for (const fn of Object.values(server)) fn.mockReset();
  act(() => loadPlanFor(null));
  setCatalog(null);
});

describe("loading the real plan", () => {
  it("before add-billing.sql is applied, it stays on the sample preview", async () => {
    server.getMyBillingFn.mockResolvedValue({ missing: true });
    await act(async () => {
      expect(await connectPlan("u1", "token-1")).toBe(false);
    });
    expect(getPlanState().live).toBe(false);
    expect(getPlanState().subscription.planId).toBe("premium");
  });

  it("live: the database's plan, catalog and usage replace the sample", async () => {
    await goLive();
    const s = getPlanState();
    expect(s.live).toBe(true);
    expect(s.subscription.planId).toBe("free");
    expect(s.usage).toEqual({ households: 2, kasambahay: 5, co_managers: 0 });
    expect(CATALOG.find((p) => p.id === "normal")?.prices.monthly).toBe(25_000);
  });

  it("a slow first answer arriving after a newer one doesn't overwrite it", async () => {
    let first!: (v: unknown) => void;
    server.getMyBillingFn
      .mockReturnValueOnce(new Promise((r) => (first = r)))
      .mockResolvedValueOnce({
        missing: false,
        billing: billing({ subscription: { ...billing().subscription, planId: "premium" } }),
      });
    await act(async () => {
      const a = connectPlan("u1", "old-token");
      await connectPlan("u1", "new-token");
      first({ missing: false, billing: billing() });
      await a;
    });
    expect(getPlanState().subscription.planId).toBe("premium");
  });

  it("a failed load doesn't crash and doesn't invent a plan", async () => {
    server.getMyBillingFn.mockRejectedValue(new Error("offline"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await act(async () => {
      expect(await connectPlan("u1", "token-1")).toBe(false);
    });
    expect(getPlanState().live).toBe(false);
    warn.mockRestore();
  });
});

describe("live, nothing can be paid for or changed in the browser alone", () => {
  it("the sample payment, plan change and preview switch all refuse", async () => {
    await goLive();
    expect(changePlan("premium", "monthly", [])).toMatchObject({ ok: false });
    expect(await payForPlan("premium", "monthly", [], "gcash")).toMatchObject({ ok: false });
    act(() => previewStatus("restricted"));
    expect(getPlanState().subscription).toMatchObject({ planId: "free", status: "active" });
    expect(getPlanState().payments).toHaveLength(0);
  });

  it("checkout sends no amount: only what's being bought, then goes to Xendit's page", async () => {
    await goLive();
    server.startCheckoutFn.mockResolvedValue({
      ok: true,
      invoiceUrl: "https://checkout-staging.xendit.co/web/inv_9",
      paymentId: "p9",
    });
    await checkout("plan", "normal", "monthly", [{ addonId: "extra_kasambahay", quantity: 0 }]);
    const sent = server.startCheckoutFn.mock.calls[0][0].data;
    expect(sent).toEqual({
      token: "token-1",
      kind: "plan",
      planId: "normal",
      cycle: "monthly",
      addons: [],
      returnUrl: "https://linara.test",
    });
    expect(JSON.stringify(sent)).not.toMatch(/amount|25000|250/);
    expect(assign).toHaveBeenCalledWith("https://checkout-staging.xendit.co/web/inv_9");
  });

  it("a double tap opens one payment", async () => {
    await goLive();
    let done!: (v: unknown) => void;
    server.startCheckoutFn.mockReturnValue(new Promise((r) => (done = r)));
    const a = checkout("plan", "normal", "monthly", []);
    const b = await checkout("plan", "normal", "monthly", []);
    expect(b).toEqual({ ok: false, message: "A payment is already being opened." });
    done({ ok: true, invoiceUrl: "https://x.test/1", paymentId: "p1" });
    await a;
    expect(server.startCheckoutFn).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it("checkout failing on the network says so and doesn't leave", async () => {
    await goLive();
    server.startCheckoutFn.mockRejectedValue(new Error("fetch failed"));
    expect(await checkout("plan", "normal", "monthly", [])).toMatchObject({ ok: false });
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("Your plan, live", () => {
  it("test mode, no preview controls, the database's price, and Pay goes to Xendit", async () => {
    await goLive();
    render(<MyPlanPage />);
    expect(screen.getByText("Test mode")).toBeTruthy();
    expect(screen.queryByText("Preview controls")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset preview" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("radio", { name: /Normal/ }));
    fireEvent.click(dialog.getByRole("button", { name: "Continue to payment" }));
    expect(screen.queryByText("Pay with")).toBeNull();
    server.startCheckoutFn.mockResolvedValue({ ok: false, message: "That plan isn't offered." });
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Pay ₱250 on Xendit" }),
      );
    });
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toBe(
      "That plan isn't offered.",
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it("usage comes from the database, across every household", async () => {
    await goLive();
    render(<MyPlanPage />);
    expect(screen.getByText(/Across every household you own/)).toBeTruthy();
    expect(screen.getByText("5 of 1")).toBeTruthy();
  });

  it("moving to Free saves in the database, then shows what it holds", async () => {
    await goLive(
      billing({
        subscription: {
          ...billing().subscription,
          planId: "normal",
          periodEnd: "2026-11-28T00:00:00.000Z",
        },
      }),
    );
    server.changeToFreeFn.mockResolvedValue({ ok: true });
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("radio", { name: /Free/ }));
    server.getMyBillingFn.mockResolvedValue({ missing: false, billing: billing() });
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Change plan" }),
      );
    });
    expect(server.changeToFreeFn).toHaveBeenCalledWith({ data: { token: "token-1" } });
    expect(getPlanState().subscription.planId).toBe("free");
  });

  it("a refusal from the database is shown, and nothing changes", async () => {
    await goLive(billing({ subscription: { ...billing().subscription, planId: "normal" } }));
    server.changeToFreeFn.mockResolvedValue({
      ok: false,
      message: "Only a household's primary manager manages its plan.",
    });
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("radio", { name: /Free/ }));
    await act(async () => {
      fireEvent.click(
        within(screen.getByRole("dialog")).getByRole("button", { name: "Change plan" }),
      );
    });
    expect(screen.getByRole("alert").textContent).toMatch(/primary manager/);
    expect(getPlanState().subscription.planId).toBe("normal");
  });

  it("a co-manager sees the owner's plan but can't change or buy, and sees no payments", async () => {
    await goLive(billing({ owner: false, usage: null, payments: [payment({ status: "paid" })] }));
    render(<MyPlanPage />);
    expect(screen.queryByRole("button", { name: "Change plan" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Buy add-ons" })).toBeNull();
    expect(screen.getByText("Only the household's primary manager buys add-ons.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Payments" })).toBeNull();
  });

  it("back from Xendit: waits for the callback, then says it's paid", async () => {
    vi.useFakeTimers();
    await goLive(billing({ payments: [payment({})] }));
    render(<MyPlanPage paymentId={payment({}).id} />);
    expect(screen.getByRole("status").textContent).toMatch(/Confirming your payment/);
    server.getMyBillingFn.mockResolvedValue({
      missing: false,
      billing: billing({
        subscription: { ...billing().subscription, planId: "normal" },
        payments: [payment({ status: "paid", method: "GCASH", invoiceUrl: null })],
      }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(screen.getByRole("status").textContent).toMatch(/Payment received/);
    expect(screen.getByText(/GCash/)).toBeTruthy();
  });

  it("back from Xendit after an expired page: nothing charged, try again", async () => {
    await goLive(billing({ payments: [payment({ status: "expired", invoiceUrl: null })] }));
    render(<MyPlanPage paymentId={payment({}).id} />);
    expect(screen.getByRole("status").textContent).toMatch(/didn't go through/);
  });

  it("an unpaid page that's still open can be finished from the history", async () => {
    await goLive(billing({ payments: [payment({})] }));
    render(<MyPlanPage />);
    expect(screen.getByRole("link", { name: "Finish paying" }).getAttribute("href")).toBe(
      "https://checkout-staging.xendit.co/web/inv_1",
    );
    expect(screen.getByText("Waiting")).toBeTruthy();
  });
});
