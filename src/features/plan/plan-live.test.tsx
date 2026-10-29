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
  cancelPlanFn: vi.fn(),
  resumePlanFn: vi.fn(),
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

  it("past due, moving to Free saves in the database, then shows what it holds", async () => {
    // With a paid period running, Free waits for a cancel instead (below).
    await goLive(
      billing({
        subscription: {
          ...billing().subscription,
          planId: "normal",
          status: "past_due",
          periodEnd: "2026-10-01T00:00:00.000Z",
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

  it("buying add-ons live never claims it's a sample", async () => {
    await goLive(billing({ subscription: { ...billing().subscription, planId: "normal" } }));
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Buy add-ons" }));
    const d = within(screen.getByRole("dialog"));
    expect(d.queryByText(/sample|nothing is charged/i)).toBeNull();
    expect(d.getByText(/Xendit/)).toBeTruthy();
  });

  it("removing an add-on live sends only what stays, then shows what the database holds", async () => {
    const sub = {
      ...billing().subscription,
      planId: "normal",
      addons: [{ addonId: "extra_kasambahay", quantity: 2 }],
    };
    await goLive(billing({ subscription: sub }));
    server.removeAddonsFn.mockResolvedValue({ ok: true });
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Remove one Extra kasambahay" }));
    server.getMyBillingFn.mockResolvedValue({
      missing: false,
      billing: billing({
        subscription: { ...sub, addons: [{ addonId: "extra_kasambahay", quantity: 1 }] },
      }),
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    });
    expect(server.removeAddonsFn).toHaveBeenCalledWith({
      data: { token: "token-1", addons: [{ addonId: "extra_kasambahay", quantity: 1 }] },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(getPlanState().subscription.addons).toEqual([
      { addonId: "extra_kasambahay", quantity: 1 },
    ]);
  });

  it("a refused remove stays open and says why, and nothing changes", async () => {
    const sub = {
      ...billing().subscription,
      planId: "normal",
      addons: [{ addonId: "extra_kasambahay", quantity: 1 }],
    };
    await goLive(billing({ subscription: sub }));
    server.removeAddonsFn.mockResolvedValue({ ok: false, message: "Pay what's owed first." });
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Remove one Extra kasambahay" }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    });
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(
      /Pay what's owed first/,
    );
    expect(getPlanState().subscription.addons).toEqual(sub.addons);
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

  it("a slow callback (2 minutes, seen on dev): keeps checking, then says it's paid", async () => {
    vi.useFakeTimers();
    await goLive(billing({ payments: [payment({})] }));
    render(<MyPlanPage paymentId={payment({}).id} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(95_000);
    });
    expect(screen.getByRole("status").textContent).toMatch(
      /Xendit is taking longer than usual\. You can leave this page/,
    );
    const asked = server.getMyBillingFn.mock.calls.length;
    server.getMyBillingFn.mockResolvedValue({
      missing: false,
      billing: billing({
        subscription: { ...billing().subscription, planId: "normal" },
        payments: [payment({ status: "paid", method: "GCASH", invoiceUrl: null })],
      }),
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(server.getMyBillingFn.mock.calls.length).toBeGreaterThan(asked);
    expect(screen.getByRole("status").textContent).toMatch(/Payment received/);
  });

  it("after 10 minutes it stops asking, but checks again when the tab comes back", async () => {
    vi.useFakeTimers();
    await goLive(billing({ payments: [payment({})] }));
    render(<MyPlanPage paymentId={payment({}).id} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11 * 60_000);
    });
    expect(screen.getByRole("status").textContent).toMatch(/hasn't confirmed it yet/);
    const asked = server.getMyBillingFn.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(server.getMyBillingFn.mock.calls.length).toBe(asked);
    server.getMyBillingFn.mockResolvedValue({
      missing: false,
      billing: billing({ payments: [payment({ status: "paid", invoiceUrl: null })] }),
    });
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(server.getMyBillingFn.mock.calls.length).toBeGreaterThan(asked);
    expect(screen.getByRole("status").textContent).toMatch(/Payment received/);
  });

  it("while a payment is being confirmed, nothing new can be bought", async () => {
    await goLive(
      billing({
        subscription: { ...billing().subscription, planId: "normal" },
        payments: [payment({})],
      }),
    );
    render(<MyPlanPage paymentId={payment({}).id} paymentResult="paid" />);
    expect(
      (screen.getByRole("button", { name: "Change plan" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Buy add-ons" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Waiting for Xendit to confirm your last payment/)).toBeTruthy();
  });

  it("sent back without paying: no waiting, and buying stays open", async () => {
    await goLive(
      billing({
        subscription: { ...billing().subscription, planId: "normal" },
        payments: [payment({})],
      }),
    );
    vi.useFakeTimers();
    render(
      <MyPlanPage paymentId={payment({}).id} paymentResult="failed" onPaymentSeen={() => {}} />,
    );
    expect(screen.getByRole("status").textContent).toMatch(
      /didn't go through, so nothing was charged/,
    );
    const asked = server.getMyBillingFn.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(server.getMyBillingFn.mock.calls.length).toBe(asked);
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Change plan" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("back from Xendit after an expired page: nothing charged, try again", async () => {
    await goLive(billing({ payments: [payment({ status: "expired", invoiceUrl: null })] }));
    render(<MyPlanPage paymentId={payment({}).id} />);
    expect(screen.getByRole("status").textContent).toMatch(/didn't go through/);
  });

  it("a page replaced by a newer payment waits behind Show replaced, as Replaced, with nothing to finish", async () => {
    await goLive(
      billing({
        payments: [
          payment({ id: "6f1c1b0e-0000-4000-8000-000000000002", status: "paid", invoiceUrl: null }),
          payment({ status: "cancelled", invoiceUrl: null }),
        ],
      }),
    );
    render(<MyPlanPage />);
    expect(screen.getByText("Paid")).toBeTruthy();
    expect(screen.queryByText("Replaced")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show 1 replaced page" }));
    expect(screen.getByText("Replaced")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Finish paying" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hide replaced pages" }));
    expect(screen.queryByText("Replaced")).toBeNull();
  });

  it("an invoice reference sits on its own line, not inside the sentence", async () => {
    await goLive(billing({ payments: [payment({ status: "paid", invoiceUrl: null })] }));
    render(<MyPlanPage />);
    expect(screen.getByText("Ref. inv_1")).toBeTruthy();
  });

  it("over the limit on Free: it doesn't offer add-ons Free can't buy", async () => {
    await goLive();
    render(<MyPlanPage />);
    const over = screen.getAllByText(/over\./).map((e) => e.textContent);
    expect(over.length).toBeGreaterThan(0);
    expect(over.join(" ")).not.toMatch(/add-on/);
    expect(over.join(" ")).toMatch(/Choose a bigger plan/);
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

describe("plan changes while a paid period runs, live", () => {
  const NOW = Date.parse("2026-11-08T00:00:00.000Z");
  const DAY = 86_400_000;
  // Normal monthly (₱250 in this catalog) with 20 of 30 days left, renewing Nov 28.
  const runningSub = (change: Partial<MyBilling["subscription"]> = {}) => ({
    ...billing().subscription,
    planId: "normal",
    periodStart: new Date(NOW - 10 * DAY).toISOString(),
    periodEnd: new Date(NOW + 20 * DAY).toISOString(),
    ...change,
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  const dialog = () => within(screen.getByRole("dialog"));
  const radio = (name: RegExp) => dialog().getByRole("radio", { name }) as HTMLInputElement;

  it("lower plans can't be picked, and it says to cancel instead", async () => {
    await goLive(billing({ subscription: runningSub() }));
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    expect(radio(/Free/).disabled).toBe(true);
    expect(radio(/Premium/).disabled).toBe(false);
    expect(
      dialog().getByText(
        /To move to a lower plan, cancel this one: you keep it until Nov 28, 2026/,
      ),
    ).toBeTruthy();
  });

  it("an upgrade that leaves out a paid add-on says it's dropped, not refunded", async () => {
    await goLive(
      billing({
        subscription: runningSub({ addons: [{ addonId: "extra_kasambahay", quantity: 2 }] }),
      }),
    );
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    fireEvent.click(radio(/Premium/));
    expect(dialog().queryByText(/you've paid for/)).toBeNull();
    fireEvent.click(dialog().getByRole("button", { name: "Fewer: Extra kasambahay" }));
    expect(
      dialog().getByText(
        "This drops 1 extra kasambahay you've paid for this period. It isn't refunded.",
      ),
    ).toBeTruthy();
  });

  it("an upgrade shows the gap for the time left, then pays it on Xendit", async () => {
    await goLive(billing({ subscription: runningSub() }));
    server.startCheckoutFn.mockResolvedValue({
      ok: true,
      invoiceUrl: "https://checkout-staging.xendit.co/web/x",
    });
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    fireEvent.click(radio(/Premium/));
    // (₱499 - ₱250) x 20/30 = ₱166.00.
    expect(
      dialog().getByText(
        "₱166 now for the rest of this period, then ₱499 a month from Nov 28, 2026.",
      ),
    ).toBeTruthy();
    fireEvent.click(dialog().getByRole("button", { name: "Continue to payment" }));
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Pay ₱166 on Xendit" }));
    });
    const sent = server.startCheckoutFn.mock.calls[0][0].data;
    expect(sent).toMatchObject({ kind: "plan", planId: "premium", cycle: "monthly" });
    expect(sent).not.toHaveProperty("amount");
  });

  it("on a yearly plan, monthly can't be picked", async () => {
    await goLive(billing({ subscription: runningSub({ planId: "premium", cycle: "annual" }) }));
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    const monthly = dialog().getByRole("button", { name: /^Monthly/ }) as HTMLButtonElement;
    expect(monthly.disabled).toBe(true);
  });

  it("Cancel plan asks first, then the plan ends at its renewal date", async () => {
    await goLive(billing({ subscription: runningSub() }));
    server.cancelPlanFn.mockResolvedValue({ ok: true });
    render(<MyPlanPage />);
    expect(screen.getByText("Renews Nov 28, 2026.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel plan" }));
    expect(dialog().getByText(/You keep everything on Normal until Nov 28, 2026/)).toBeTruthy();
    server.getMyBillingFn.mockResolvedValue({
      missing: false,
      billing: billing({ subscription: runningSub({ cancelAtPeriodEnd: true }) }),
    });
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Cancel plan" }));
    });
    expect(server.cancelPlanFn).toHaveBeenCalledWith({ data: { token: "token-1" } });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Ends Nov 28, 2026, then moves to Free.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull();
    expect(screen.getByRole("button", { name: "Keep my plan" })).toBeTruthy();
  });

  it("closing the cancel question changes nothing", async () => {
    await goLive(billing({ subscription: runningSub() }));
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel plan" }));
    fireEvent.click(dialog().getByRole("button", { name: "Keep Normal" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(server.cancelPlanFn).not.toHaveBeenCalled();
  });

  it("a refused cancel stays open and says why", async () => {
    await goLive(billing({ subscription: runningSub() }));
    server.cancelPlanFn.mockResolvedValue({
      ok: false,
      message: "There's no paid plan running to cancel.",
    });
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel plan" }));
    await act(async () => {
      fireEvent.click(dialog().getByRole("button", { name: "Cancel plan" }));
    });
    expect(dialog().getByRole("alert").textContent).toMatch(/no paid plan running/);
    expect(getPlanState().subscription.cancelAtPeriodEnd).toBe(false);
  });

  it("Keep my plan undoes the cancel in the database", async () => {
    await goLive(billing({ subscription: runningSub({ cancelAtPeriodEnd: true }) }));
    server.resumePlanFn.mockResolvedValue({ ok: true });
    server.getMyBillingFn.mockResolvedValue({
      missing: false,
      billing: billing({ subscription: runningSub() }),
    });
    render(<MyPlanPage />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Keep my plan" }));
    });
    expect(server.resumePlanFn).toHaveBeenCalledWith({ data: { token: "token-1" } });
    expect(screen.getByText("Renews Nov 28, 2026.")).toBeTruthy();
  });

  it("nothing to cancel on Free, while past due, or for a co-manager", async () => {
    await goLive(billing());
    const { unmount } = render(<MyPlanPage />);
    expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull();
    unmount();
    await goLive(
      billing({
        subscription: runningSub({
          status: "past_due",
          periodEnd: new Date(NOW - 2 * DAY).toISOString(),
        }),
      }),
    );
    const second = render(<MyPlanPage />);
    expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull();
    second.unmount();
    await goLive(billing({ owner: false, usage: null, subscription: runningSub() }));
    render(<MyPlanPage />);
    expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull();
  });
});
