// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const stores = vi.hoisted(() => ({
  current: {
    session: {
      households: [
        { id: "h2", name: "Lola's house", role: "primary_manager", isCurrent: false },
        { id: "h1", name: "Santos home", role: "primary_manager", isCurrent: true },
      ],
      admins: [
        { id: "a1", type: "primary" },
        { id: "a2", type: "co" },
      ],
    },
    invites: {
      invites: [
        { id: "k1", name: "Marites", claimedName: "Marites Santos", status: "active" },
        { id: "k2", name: "Joy", claimedName: "", status: "pending" },
        { id: "k3", name: "Old", claimedName: "", status: "ended" },
      ],
    },
  },
}));
const inApp = vi.hoisted(() => ({ value: false }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, className }: { to: string; children: ReactNode; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/dashboard/app-store-context", () => ({
  useAppStores: () => stores.current,
}));
vi.mock("@/lib/mobile-app", () => ({ inMobileApp: () => inApp.value }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { LimitNotice, PlanGate } from "./components/plan-gate";
import { OverLimitBanner } from "./components/over-limit-banner";
import { useCanAdd } from "./hooks/use-can-add";
import { MyPlanPage } from "./pages/my-plan-page";
import { changePlan, previewStatus, resetPlan } from "./plan.store";

afterEach(() => {
  cleanup();
  act(() => resetPlan());
  inApp.value = false;
});

const dialog = () => within(screen.getByRole("dialog"));

function InviteKasambahay() {
  const check = useCanAdd("kasambahay");
  return (
    <>
      <button disabled={!check.ok}>Invite a helper</button>
      <LimitNotice check={check} />
    </>
  );
}

describe("Your plan page", () => {
  it("shows the plan, a placeholder price, usage from the app's data, and pay & HR off for everyone", () => {
    render(<MyPlanPage />);
    expect(screen.getByRole("heading", { name: "Premium" })).toBeTruthy();
    expect(screen.getByText("₱399 a month")).toBeTruthy();
    expect(screen.getByText("(placeholder price)")).toBeTruthy();
    // Two owned households of 3; two kasambahay (the ended one doesn't count); one co-manager.
    expect(screen.getByText("2 of 3")).toBeTruthy();
    expect(screen.getByText("2, no limit")).toBeTruthy();
    expect(screen.getByText("1 of 3")).toBeTruthy();
    expect(screen.getByText("Off for everyone")).toBeTruthy();
  });

  it("inside the Android app: no price and no way to buy", () => {
    inApp.value = true;
    render(<MyPlanPage />);
    expect(screen.queryByText("₱399 a month")).toBeNull();
    expect(screen.queryByRole("button", { name: "Change plan" })).toBeNull();
    expect(screen.getByText("Plan changes aren't available in the app.")).toBeTruthy();
  });

  it("warns before moving to a plan that's too small, then shows what's over", () => {
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    fireEvent.click(dialog().getByRole("radio", { name: /Free/ }));
    expect(
      dialog().getByText(/more than this plan allows \(households, kasambahay, co-managers\)/),
    ).toBeTruthy();
    fireEvent.click(dialog().getByRole("button", { name: "Change plan" }));
    expect(screen.getByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.getAllByText("Not on your plan").length).toBeGreaterThan(0);
    // Households and kasambahay are both 2 of 1; the one co-manager is 1 of 0.
    expect(screen.getAllByText("2 of 1")).toHaveLength(2);
    expect(screen.getByText("1 of 0")).toBeTruthy();
  });

  it("refuses resubmitting the plan you already have", () => {
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    fireEvent.click(dialog().getByRole("button", { name: "Change plan" }));
    expect(dialog().getByRole("alert").textContent).toMatch(/already have/);
  });

  it("prices add-ons as they're added, and stops at 10", () => {
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Change plan" }));
    fireEvent.click(dialog().getByRole("radio", { name: /Normal/ }));
    const more = dialog().getByRole("button", { name: "More: Extra kasambahay" });
    fireEvent.click(more);
    expect(dialog().getByText("₱249 a month")).toBeTruthy();
    for (let i = 0; i < 15; i++) fireEvent.click(more);
    expect((more as HTMLButtonElement).disabled).toBe(true);
    expect(dialog().getByText("₱699 a month")).toBeTruthy();
  });

  it("explains a failed payment's grace period", () => {
    render(<MyPlanPage />);
    fireEvent.click(screen.getByRole("button", { name: "Payment failed" }));
    expect(screen.getByText(/Everything keeps working until Dec 3, 2026/)).toBeTruthy();
  });
});

describe("locks and limits", () => {
  it("a feature off the plan shows the lock instead of the screen", () => {
    act(() => {
      changePlan("free", "monthly", []);
    });
    render(
      <PlanGate feature="pantry">
        <p>Pantry screen</p>
      </PlanGate>,
    );
    expect(screen.queryByText("Pantry screen")).toBeNull();
    expect(screen.getByText("Pantry and groceries isn't on your plan")).toBeTruthy();
    expect(screen.getByText(/included from Normal/)).toBeTruthy();
  });

  it("shows the screen when the plan has it", () => {
    render(
      <PlanGate feature="pantry">
        <p>Pantry screen</p>
      </PlanGate>,
    );
    expect(screen.getByText("Pantry screen")).toBeTruthy();
  });

  it("turns the invite off at the kasambahay limit and says why", () => {
    act(() => {
      changePlan("free", "monthly", []);
    });
    render(<InviteKasambahay />);
    expect(
      (screen.getByRole("button", { name: "Invite a helper" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Free allows 1 kasambahay, and you have 2/)).toBeTruthy();
  });

  it("blocks adding anything while the payment is overdue past grace", () => {
    act(() => previewStatus("restricted"));
    render(<InviteKasambahay />);
    expect(
      (screen.getByRole("button", { name: "Invite a helper" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/nothing new can be added/)).toBeTruthy();
  });
});

describe("choosing what stays active", () => {
  it("shows nothing while the household fits its plan", () => {
    const { container } = render(<OverLimitBanner />);
    expect(container.innerHTML).toBe("");
  });

  it("after a downgrade, the picker holds the choice to the plan's limits", () => {
    act(() => {
      changePlan("free", "monthly", []);
    });
    render(<OverLimitBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Choose what stays active" }));
    const boxes = dialog().getAllByRole("checkbox") as HTMLInputElement[];
    // The household you're in comes first, even though it's listed second.
    expect(dialog().getAllByRole("listitem")[0].textContent).toMatch(/Santos home/);
    // Pre-picked: the first household and the first kasambahay; the others are locked at the limit.
    expect(boxes.map((b) => [b.checked, b.disabled])).toEqual([
      [true, false],
      [false, true],
      [true, false],
      [false, true],
    ]);
    fireEvent.click(boxes[0]);
    fireEvent.click(dialog().getByRole("button", { name: "Save" }));
    expect(dialog().getByRole("alert").textContent).toMatch(/at least one household/);
    fireEvent.click(boxes[1]);
    fireEvent.click(dialog().getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/chosen 1 household and 1 kasambahay/)).toBeTruthy();
  });
});
