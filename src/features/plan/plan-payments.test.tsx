// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inApp = vi.hoisted(() => ({ value: false }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));
vi.mock("@/features/dashboard/app-store-context", () => ({
  useAppStores: () => ({
    session: {
      households: [{ id: "h1", name: "Santos home", role: "primary_manager", isCurrent: true }],
      admins: [{ id: "a1", type: "primary" }],
    },
    invites: { invites: [{ id: "k1", name: "Marites", claimedName: "", status: "active" }] },
  }),
}));
vi.mock("@/lib/mobile-app", () => ({ inMobileApp: () => inApp.value }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { MyPlanPage } from "./pages/my-plan-page";
import {
  changePlan,
  payForPlan,
  PROCESSING_MS,
  previewStatus,
  resetPlan,
  usePlan,
} from "./plan.store";

beforeEach(() => {
  vi.useFakeTimers();
  act(() => {
    changePlan("free", "monthly", []);
  });
});
afterEach(() => {
  cleanup();
  act(() => resetPlan());
  vi.useRealTimers();
  inApp.value = false;
});

const dialog = () => within(screen.getByRole("dialog"));
/** The receipt line, whose reference sits in its own span. */
const receiptText = () =>
  dialog().getByText(
    (_, el) => el?.tagName === "P" && /reference SAMPLE-/.test(el.textContent ?? ""),
  ).textContent;
const finishProcessing = () =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(PROCESSING_MS);
  });

function openNormalCheckout() {
  render(<MyPlanPage />);
  fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
  fireEvent.click(dialog().getByRole("radio", { name: /Normal/ }));
  fireEvent.click(dialog().getByRole("button", { name: "Continue to payment" }));
}

describe("sample payments", () => {
  it("a paid plan goes through a sample checkout, then the plan changes and the payment is listed", async () => {
    openNormalCheckout();
    expect(
      dialog().getByText(
        "This is a sample payment: nothing is charged, and it goes through without paying.",
      ),
    ).toBeTruthy();
    const pay = dialog().getByRole("button", { name: "Pay ₱199" });
    fireEvent.click(pay);
    expect(
      dialog()
        .getByRole("button", { name: /Paying/ })
        .hasAttribute("disabled"),
    ).toBe(true);
    await finishProcessing();
    expect(dialog().getByText("Payment received")).toBeTruthy();
    expect(receiptText()).toMatch(/₱199 by GCash, reference SAMPLE-1001/);
    fireEvent.click(dialog().getByRole("button", { name: "Done" }));
    expect(screen.getByRole("heading", { name: "Normal" })).toBeTruthy();
    const history = within(screen.getByRole("region", { name: "Payments" }));
    expect(history.getByText("₱199")).toBeTruthy();
    expect(history.getByText("Paid")).toBeTruthy();
  });

  it("the test card declines: nothing changes but the history, and another way can be tried", async () => {
    openNormalCheckout();
    fireEvent.click(dialog().getByRole("radio", { name: /Test card that declines/ }));
    fireEvent.click(dialog().getByRole("button", { name: "Pay ₱199" }));
    await finishProcessing();
    expect(dialog().getByRole("alert").textContent).toMatch(/declined/);
    expect(usePlanState().subscription.planId).toBe("free");
    fireEvent.click(dialog().getByRole("radio", { name: /Maya/ }));
    fireEvent.click(dialog().getByRole("button", { name: "Pay ₱199" }));
    await finishProcessing();
    expect(receiptText()).toMatch(/by Maya, reference SAMPLE-1002/);
    expect(usePlanState().payments.map((p) => p.status)).toEqual(["paid", "failed"]);
  });

  it("Escape can't close the checkout while a payment is going through", async () => {
    openNormalCheckout();
    fireEvent.click(dialog().getByRole("button", { name: "Pay ₱199" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeNull();
    await finishProcessing();
    expect(dialog().getByText("Payment received")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a double tap on Pay pays once", async () => {
    openNormalCheckout();
    const pay = dialog().getByRole("button", { name: "Pay ₱199" });
    fireEvent.click(pay);
    fireEvent.click(pay);
    fireEvent.click(pay);
    await finishProcessing();
    expect(usePlanState().payments).toHaveLength(1);
  });

  it("two payments started at once: the second is refused, not charged twice", async () => {
    const first = payForPlan("premium", "monthly", [], "gcash");
    const second = await payForPlan("premium", "monthly", [], "gcash");
    expect(second).toEqual({ ok: false, message: "A payment is already going through." });
    await vi.advanceTimersByTimeAsync(PROCESSING_MS);
    expect((await first).ok).toBe(true);
    expect(usePlanState().payments).toHaveLength(1);
  });

  it("refuses paying for Free, an unknown method, or the plan it already has", async () => {
    act(() => {
      changePlan("premium", "monthly", []);
    });
    // From Premium, so Free isn't refused as "the plan it already has".
    expect(await payForPlan("free", "monthly", [], "gcash")).toEqual({
      ok: false,
      message: "Nothing to pay on this plan.",
    });
    expect(
      await payForPlan("normal", "monthly", [], "bitcoin" as unknown as "gcash"),
    ).toMatchObject({ ok: false, message: "Choose how to pay." });
    act(() => {
      changePlan("normal", "monthly", []);
    });
    expect(await payForPlan("normal", "monthly", [], "gcash")).toMatchObject({
      ok: false,
      message: "That's the plan you already have.",
    });
    expect(usePlanState().payments).toHaveLength(0);
  });

  it("after a failed payment, Pay now pays what's owed and everything is back to normal", async () => {
    act(() => {
      changePlan("premium", "monthly", []);
    });
    act(() => previewStatus("past_due"));
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Pay ₱399 now" }));
    fireEvent.click(dialog().getByRole("button", { name: "Pay ₱399" }));
    await finishProcessing();
    fireEvent.click(dialog().getByRole("button", { name: "Done" }));
    expect(usePlanState().subscription.status).toBe("active");
    expect(screen.queryByRole("button", { name: /now$/ })).toBeNull();
    expect(screen.getByText(/^Renews /)).toBeTruthy();
  });

  it("inside the Android app there's no way to pay and no payment history", () => {
    act(() => {
      changePlan("premium", "monthly", []);
    });
    act(() => previewStatus("past_due"));
    inApp.value = true;
    render(<MyPlanPage />);
    expect(screen.queryByRole("button", { name: /^Pay / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Change plan" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Payments" })).toBeNull();
  });
});

/** The store's current state, read the way a component would. */
function usePlanState() {
  let out!: ReturnType<typeof usePlan>;
  function Probe() {
    out = usePlan();
    return null;
  }
  const { unmount } = render(<Probe />);
  unmount();
  return out;
}
