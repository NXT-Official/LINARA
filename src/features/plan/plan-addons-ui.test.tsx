// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const inApp = vi.hoisted(() => ({ value: false }));
// Three kasambahay: Normal's limit, so one more needs an add-on.
const staff = vi.hoisted(() =>
  ["k1", "k2", "k3"].map((id) => ({ id, name: id, claimedName: "", status: "active" })),
);

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
  }: {
    to: string;
    search?: Record<string, string>;
    children: ReactNode;
  }) => <a href={search ? `${to}?${new URLSearchParams(search)}` : to}>{children}</a>,
}));
vi.mock("@/features/dashboard/app-store-context", () => ({
  useAppStores: () => ({
    session: {
      households: [{ id: "h1", name: "Santos home", role: "primary_manager", isCurrent: true }],
      admins: [{ id: "a1", type: "primary" }],
    },
    invites: { invites: staff },
  }),
}));
vi.mock("@/lib/mobile-app", () => ({ inMobileApp: () => inApp.value }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { LimitNotice } from "./components/plan-gate";
import { useCanAdd } from "./hooks/use-can-add";
import { MyPlanPage } from "./pages/my-plan-page";
import { changePlan, getPlanState, PROCESSING_MS, resetPlan } from "./plan.store";

beforeEach(() => {
  vi.useFakeTimers();
  act(() => {
    changePlan("normal", "monthly", []);
  });
});
afterEach(() => {
  cleanup();
  act(() => resetPlan());
  vi.useRealTimers();
  inApp.value = false;
});

const dialog = () => within(screen.getByRole("dialog"));
const addons = () => within(screen.getByRole("region", { name: "Add-ons" }));

function InviteKasambahay() {
  return <LimitNotice check={useCanAdd("kasambahay")} />;
}

describe("buying add-ons on Your plan", () => {
  it("shows the add-ons with their prices and what you have", () => {
    render(<MyPlanPage />);
    expect(addons().getByText("Extra kasambahay")).toBeTruthy();
    expect(addons().getByText(/Adds 1 kasambahay, ₱50 a month/)).toBeTruthy();
    expect(addons().getAllByText("None")).toHaveLength(2);
    expect(addons().getByRole("button", { name: "Buy add-ons" })).toBeTruthy();
  });

  it("one more kasambahay: ₱50 now, paid through the sample checkout, and the limit goes up", async () => {
    render(<MyPlanPage />);
    expect(screen.getByText("3 of 3")).toBeTruthy();
    fireEvent.click(addons().getByRole("button", { name: "Buy add-ons" }));
    fireEvent.click(dialog().getByRole("button", { name: "More: Extra kasambahay" }));
    expect(dialog().getByText("₱50 now, then ₱249 a month with your plan.")).toBeTruthy();
    expect(dialog().getByText(/your plan allows 1 household and 4 kasambahay/)).toBeTruthy();
    fireEvent.click(dialog().getByRole("button", { name: "Continue to payment" }));
    fireEvent.click(dialog().getByRole("button", { name: "Pay ₱50" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROCESSING_MS);
    });
    expect(dialog().getByText("Payment received")).toBeTruthy();
    fireEvent.click(dialog().getByRole("button", { name: "Done" }));
    expect(addons().getByText("1 kasambahay")).toBeTruthy();
    expect(screen.getByText("3 of 4")).toBeTruthy();
    expect(getPlanState().subscription.planId).toBe("normal");
    expect(getPlanState().payments[0]).toMatchObject({ kind: "addons", amount: 5_000 });
  });

  it("removing one saves without a payment", async () => {
    render(<MyPlanPage />);
    fireEvent.click(addons().getByRole("button", { name: "Buy add-ons" }));
    fireEvent.click(dialog().getByRole("button", { name: "More: Extra household" }));
    fireEvent.click(dialog().getByRole("button", { name: "Continue to payment" }));
    fireEvent.click(dialog().getByRole("button", { name: "Pay ₱100" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROCESSING_MS);
    });
    fireEvent.click(dialog().getByRole("button", { name: "Done" }));
    fireEvent.click(addons().getByRole("button", { name: "Buy add-ons" }));
    fireEvent.click(dialog().getByRole("button", { name: "Fewer: Extra household" }));
    expect(dialog().getByText("Nothing to pay. Then ₱199 a month with your plan.")).toBeTruthy();
    fireEvent.click(dialog().getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(addons().getAllByText("None")).toHaveLength(2);
    expect(getPlanState().payments).toHaveLength(1);
  });

  it("Escape can't close the add-on checkout mid-payment", async () => {
    render(<MyPlanPage />);
    fireEvent.click(addons().getByRole("button", { name: "Buy add-ons" }));
    fireEvent.click(dialog().getByRole("button", { name: "More: Extra kasambahay" }));
    fireEvent.click(dialog().getByRole("button", { name: "Continue to payment" }));
    fireEvent.click(dialog().getByRole("button", { name: "Pay ₱50" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PROCESSING_MS);
    });
    expect(dialog().getByText("Payment received")).toBeTruthy();
  });

  it("on Free there's nothing to buy, and it says why", () => {
    act(() => {
      changePlan("free", "monthly", []);
    });
    render(<MyPlanPage />);
    expect(addons().queryByRole("button", { name: "Buy add-ons" })).toBeNull();
    expect(addons().getByText(/Add-ons are for paid monthly or yearly plans/)).toBeTruthy();
  });

  it("inside the Android app: what you have, but no prices and nothing to buy", () => {
    inApp.value = true;
    render(<MyPlanPage />);
    expect(addons().queryByRole("button", { name: "Buy add-ons" })).toBeNull();
    expect(addons().queryByText(/₱/)).toBeNull();
    expect(addons().getByText("Add-ons can't be bought in the app.")).toBeTruthy();
  });
});

describe("from a limit message", () => {
  it("at Normal's kasambahay limit, the notice offers one more as an add-on", () => {
    render(<InviteKasambahay />);
    const link = screen.getByRole("link", { name: "Add one for ₱50 a month" });
    expect(link.getAttribute("href")).toBe("/manager/plan?addon=extra_kasambahay");
  });

  it("inside the Android app it never offers to buy one", () => {
    inApp.value = true;
    render(<InviteKasambahay />);
    expect(screen.queryByRole("link", { name: /Add one/ })).toBeNull();
    expect(screen.getByRole("link", { name: "See your plan" })).toBeTruthy();
  });

  it("on Free it points at the plan instead, since Free takes no add-ons", () => {
    act(() => {
      changePlan("free", "monthly", []);
    });
    render(<InviteKasambahay />);
    expect(screen.queryByRole("link", { name: /Add one/ })).toBeNull();
    expect(screen.getByRole("link", { name: "See your plan" })).toBeTruthy();
  });

  it("the link opens the purchase with one more already added, then clears itself", () => {
    const used = vi.fn();
    render(<MyPlanPage buyAddon="extra_kasambahay" onBuyAddonUsed={used} />);
    expect(dialog().getByText("₱50 now, then ₱249 a month with your plan.")).toBeTruthy();
    expect(used).toHaveBeenCalled();
  });
});
