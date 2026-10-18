// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingSnapshot, Entitlements, PlatformInvoice } from "../billing.types";
import type { Plan } from "../plan.types";

const billing = vi.hoisted(() => ({ value: {} as unknown }));
const plansFn = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/dashboard/app-store-context", () => ({
  useAppStores: () => ({
    session: { token: "t", householdId: "h1", status: "authed", adminType: "primary" },
  }),
}));
vi.mock("../hooks/use-billing", () => ({ useBilling: () => billing.value }));
vi.mock("../plan.actions", () => ({ listPublicPlansFn: plansFn }));
vi.mock("../billing.actions", () => ({
  startCheckoutFn: vi.fn(),
  renewFn: vi.fn(),
  cancelFn: vi.fn(),
}));

import { ManagerPlanPage } from "./manager-plan-page";

beforeEach(() => {
  plansFn.mockResolvedValue({ available: true, plans: [] });
});
afterEach(cleanup);

const ent = (over: Partial<Entitlements>): Entitlements => ({
  source: "subscription",
  subscriptionId: "s1",
  planName: "Home",
  status: "active",
  effectiveStatus: "active",
  helperSeats: 3,
  managerSeats: 2,
  periodEnd: "2026-11-12T00:00:00.000Z",
  daysLeft: 24,
  ...over,
});

const invoice = (over: Partial<PlatformInvoice>): PlatformInvoice => ({
  id: "i1",
  invoiceNumber: "LIN-0001",
  subscriptionId: "s1",
  externalId: "LIN-0001",
  paymentUrl: null,
  expiresAt: null,
  status: "paid",
  amountCentavos: 49900,
  currency: "PHP",
  periodStart: "2026-10-12T00:00:00.000Z",
  periodEnd: "2026-11-12T00:00:00.000Z",
  paidAt: "2026-10-12T00:00:00.000Z",
  createdAt: "2026-10-12T00:00:00.000Z",
  ...over,
});

const plan: Plan = {
  id: "p1",
  name: "Home",
  tagline: "",
  inclusions: [],
  interval: "monthly",
  baseCentavos: 49900,
  includedHelpers: 1,
  includedManagers: null,
  includedHomes: null,
  extraHelperCentavos: 9900,
  extraManagerCentavos: null,
  extraHomeCentavos: null,
  trialDays: 0,
  isPublic: true,
  status: "active",
  sortOrder: 0,
};

const ready = (over: Partial<BillingSnapshot>) => {
  billing.value = {
    status: "ready",
    refresh: vi.fn(),
    data: {
      available: true,
      entitlements: ent({}),
      subscriptions: [],
      invoices: [],
      usage: { helpers: 2, managers: 1 },
      homes: [{ id: "h1", name: "Home", primary: true }],
      ...over,
    },
  };
};

describe("ManagerPlanPage", () => {
  it("points to Help when payments are not switched on", () => {
    billing.value = { status: "unavailable", data: null, refresh: vi.fn() };
    render(<ManagerPlanPage />);
    expect(
      screen.getByText("Payments aren't switched on yet — message us from Help."),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Help" }).getAttribute("href")).toBe(
      "/manager/help",
    );
  });

  it("shows a loading state", () => {
    billing.value = { status: "loading", data: null, refresh: vi.fn() };
    render(<ManagerPlanPage />);
    expect(screen.getByText("Loading your plan")).toBeTruthy();
  });

  it("shows an error state with a retry", () => {
    billing.value = { status: "error", data: null, refresh: vi.fn() };
    render(<ManagerPlanPage />);
    expect(screen.getByText("Couldn't load your plan.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows the free tier", async () => {
    ready({
      entitlements: ent({
        source: "free",
        subscriptionId: null,
        planName: null,
        status: null,
        effectiveStatus: null,
        helperSeats: 1,
        managerSeats: 1,
      }),
    });
    render(<ManagerPlanPage />);
    expect(screen.getByText("Free")).toBeTruthy();
    expect(await screen.findByText("Choose a plan")).toBeTruthy();
  });

  it("shows seats against usage on an active plan", () => {
    ready({});
    render(<ManagerPlanPage />);
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Helpers").closest("li")?.textContent).toContain("2 of 3");
    expect(screen.getByText("Managers").closest("li")?.textContent).toContain("1 of 2");
  });

  it("offers Pay now for a pending invoice and lists the history", () => {
    ready({
      invoices: [
        invoice({
          id: "i2",
          invoiceNumber: "LIN-0002",
          status: "pending",
          paymentUrl: "https://checkout.xendit.test/ps-2",
          expiresAt: "2999-01-01T00:00:00.000Z",
          paidAt: null,
        }),
        invoice({}),
      ],
    });
    render(<ManagerPlanPage />);
    expect(screen.getByRole("link", { name: "Pay now" }).getAttribute("href")).toBe(
      "https://checkout.xendit.test/ps-2",
    );
    expect(screen.getByText("LIN-0001")).toBeTruthy();
    expect(screen.getByText("LIN-0002")).toBeTruthy();
  });

  it("lists the public plans to choose from", async () => {
    plansFn.mockResolvedValue({ available: true, plans: [plan] });
    ready({});
    render(<ManagerPlanPage />);
    expect(await screen.findByRole("radio", { name: /Home/ })).toBeTruthy();
  });

  it("names a lapsed plan", () => {
    ready({ entitlements: ent({ status: "active", effectiveStatus: "expired" }) });
    render(<ManagerPlanPage />);
    expect(screen.getByText("Expired")).toBeTruthy();
  });
});
