// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformAdminHouseholdsPage } from "./platform-admin-households-page";

const session = vi.hoisted(() => ({ status: "admin", token: "tok" }));
const actions = vi.hoisted(() => ({
  listHouseholdsOverviewFn: vi.fn(),
  grantPlanFn: vi.fn(),
  markInvoicePaidFn: vi.fn(),
}));
const plans = vi.hoisted(() => ({ listAllPlansFn: vi.fn() }));
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("../hooks/use-platform-admin-session", () => ({
  usePlatformAdminSession: () => ({ ...session, userId: "u", logOut: vi.fn() }),
}));
vi.mock("@/lib/supabase", () => ({ createAuthedClient: vi.fn(), supabaseClient: {} }));
vi.mock("../households.actions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../households.actions")>()),
  ...actions,
}));
vi.mock("@/features/billing/plan.actions", () => plans);
vi.mock("sonner", () => ({ toast: toasts }));

const entitlements = {
  source: "subscription",
  subscriptionId: "s1",
  planName: "Family",
  status: "active",
  effectiveStatus: "active",
  helperSeats: 2,
  managerSeats: 1,
  periodEnd: "2026-12-01T00:00:00Z",
  daysLeft: 43,
};

const pending = {
  id: "i1",
  invoiceNumber: "LIN-0007",
  amountCentavos: 49900,
  createdAt: "2026-10-01T00:00:00Z",
};

const household = (over: Record<string, unknown>) => ({
  householdId: "h1",
  name: "Reyes household",
  createdAt: "2026-09-01T00:00:00Z",
  managers: 1,
  helpers: 2,
  entitlements,
  pendingInvoice: null,
  ...over,
});

const plan = (id: string, name: string, status: string) => ({
  id,
  name,
  status,
  interval: "monthly",
  baseCentavos: 49900,
  includedHelpers: 2,
  includedManagers: 1,
});

describe("PlatformAdminHouseholdsPage", () => {
  beforeEach(() => {
    Object.values(actions).forEach((fn) => fn.mockReset());
    Object.values(toasts).forEach((fn) => fn.mockReset());
    plans.listAllPlansFn.mockReset();
    plans.listAllPlansFn.mockResolvedValue({
      available: true,
      plans: [plan("p1", "Family", "active"), plan("p2", "Legacy", "archived")],
    });
  });
  afterEach(cleanup);

  it("says so when billing isn't switched on", async () => {
    actions.listHouseholdsOverviewFn.mockResolvedValue({ available: false, households: [] });
    render(<PlatformAdminHouseholdsPage />);
    expect(await screen.findByText(/aren.t switched on yet/)).toBeTruthy();
  });

  it("shows the empty state", async () => {
    actions.listHouseholdsOverviewFn.mockResolvedValue({ available: true, households: [] });
    render(<PlatformAdminHouseholdsPage />);
    expect(await screen.findByText("No households yet")).toBeTruthy();
  });

  it("shows an error with a retry", async () => {
    actions.listHouseholdsOverviewFn.mockRejectedValue(new Error("boom"));
    render(<PlatformAdminHouseholdsPage />);
    expect(await screen.findByText(/didn.t load/)).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
  });

  it("lists rows and offers Mark paid only where an invoice is pending", async () => {
    actions.listHouseholdsOverviewFn.mockResolvedValue({
      available: true,
      households: [
        household({ pendingInvoice: pending }),
        household({ householdId: "h2", name: "Santos household" }),
      ],
    });
    render(<PlatformAdminHouseholdsPage />);
    expect(await screen.findByText("Reyes household")).toBeTruthy();
    expect(screen.getByText("Santos household")).toBeTruthy();
    expect(screen.getByText(/LIN-0007/)).toBeTruthy();
    expect(screen.getByText(/₱499\.00/)).toBeTruthy();
    expect(screen.getAllByText("Mark paid")).toHaveLength(1);
    expect(screen.getAllByText("Grant plan")).toHaveLength(2);
  });

  it("filters by name", async () => {
    actions.listHouseholdsOverviewFn.mockResolvedValue({
      available: true,
      households: [household({}), household({ householdId: "h2", name: "Santos household" })],
    });
    render(<PlatformAdminHouseholdsPage />);
    await screen.findByText("Reyes household");
    fireEvent.change(screen.getByLabelText("Search households"), { target: { value: "santos" } });
    expect(screen.queryByText("Reyes household")).toBeNull();
    expect(screen.getByText("Santos household")).toBeTruthy();
  });

  it("submits the mapped grant payload and refreshes after it settles", async () => {
    actions.listHouseholdsOverviewFn.mockResolvedValue({
      available: true,
      households: [household({})],
    });
    actions.grantPlanFn.mockResolvedValue({
      available: true,
      subscriptionId: "s9",
      invoiceId: "i9",
    });
    render(<PlatformAdminHouseholdsPage />);
    fireEvent.click(await screen.findByText("Grant plan"));
    await screen.findByText("Legacy (archived)");
    fireEvent.change(screen.getByLabelText("Plan"), { target: { value: "p2" } });
    fireEvent.change(screen.getByLabelText("Helper seats"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Manager seats"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2027-01-15" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: " paid cash " } });
    expect(toasts.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Grant"));
    await waitFor(() => expect(actions.grantPlanFn).toHaveBeenCalledTimes(1));
    const arg = actions.grantPlanFn.mock.calls[0][0].data;
    expect(arg).toMatchObject({
      token: "tok",
      householdId: "h1",
      planId: "p2",
      helperSeats: 3,
      managerSeats: 2,
      note: "paid cash",
    });
    expect(arg.periodEnd).toBe("2027-01-15T15:59:59.000Z");
    await waitFor(() => expect(toasts.success).toHaveBeenCalled());
    await waitFor(() => expect(actions.listHouseholdsOverviewFn).toHaveBeenCalledTimes(2));
  });

  it("keeps the grant modal open and toasts nothing when the write fails", async () => {
    actions.listHouseholdsOverviewFn.mockResolvedValue({
      available: true,
      households: [household({})],
    });
    actions.grantPlanFn.mockRejectedValue(new Error("NOT_FOUND: plan"));
    render(<PlatformAdminHouseholdsPage />);
    fireEvent.click(await screen.findByText("Grant plan"));
    await screen.findByLabelText("Plan");
    fireEvent.change(screen.getByLabelText("Period end"), { target: { value: "2027-01-15" } });
    fireEvent.click(screen.getByText("Grant"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(toasts.success).not.toHaveBeenCalled();
  });

  it("sends blank seats and a blank period end as null", async () => {
    actions.listHouseholdsOverviewFn.mockResolvedValue({
      available: true,
      households: [household({})],
    });
    actions.grantPlanFn.mockResolvedValue({ available: true, subscriptionId: "s", invoiceId: "i" });
    render(<PlatformAdminHouseholdsPage />);
    fireEvent.click(await screen.findByText("Grant plan"));
    await screen.findByLabelText("Plan");
    fireEvent.change(screen.getByLabelText("Helper seats"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Manager seats"), { target: { value: "" } });
    fireEvent.click(screen.getByText("Grant"));
    await waitFor(() => expect(actions.grantPlanFn).toHaveBeenCalledTimes(1));
    expect(actions.grantPlanFn.mock.calls[0][0].data).toMatchObject({
      helperSeats: null,
      managerSeats: null,
      periodEnd: null,
    });
  });

  it("allows zero helper seats", async () => {
    actions.listHouseholdsOverviewFn.mockResolvedValue({
      available: true,
      households: [household({})],
    });
    actions.grantPlanFn.mockResolvedValue({ available: true, subscriptionId: "s", invoiceId: "i" });
    render(<PlatformAdminHouseholdsPage />);
    fireEvent.click(await screen.findByText("Grant plan"));
    await screen.findByLabelText("Plan");
    fireEvent.change(screen.getByLabelText("Helper seats"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("Grant"));
    await waitFor(() => expect(actions.grantPlanFn).toHaveBeenCalledTimes(1));
    expect(actions.grantPlanFn.mock.calls[0][0].data.helperSeats).toBe(0);
  });

  it("never offers a draft plan and defaults to the first active one", async () => {
    plans.listAllPlansFn.mockResolvedValue({
      available: true,
      plans: [
        plan("p0", "Old tier", "archived"),
        plan("p3", "Secret draft", "draft"),
        plan("p1", "Family", "active"),
      ],
    });
    actions.listHouseholdsOverviewFn.mockResolvedValue({
      available: true,
      households: [household({})],
    });
    render(<PlatformAdminHouseholdsPage />);
    fireEvent.click(await screen.findByText("Grant plan"));
    await screen.findByText("Old tier (archived)");
    expect(screen.queryByText("Secret draft")).toBeNull();
    expect((screen.getByLabelText("Plan") as HTMLSelectElement).value).toBe("p1");
  });

  it("words NOT_ADMIN and NOT_FOUND failures", async () => {
    actions.listHouseholdsOverviewFn.mockResolvedValue({
      available: true,
      households: [household({})],
    });
    actions.grantPlanFn.mockRejectedValue(new Error("NOT_ADMIN: nope"));
    render(<PlatformAdminHouseholdsPage />);
    fireEvent.click(await screen.findByText("Grant plan"));
    await screen.findByLabelText("Plan");
    fireEvent.click(screen.getByText("Grant"));
    expect(await screen.findByText("You don't have admin access.")).toBeTruthy();
  });

  it("says when the invoice was already settled instead of Marked paid", async () => {
    actions.listHouseholdsOverviewFn.mockResolvedValue({
      available: true,
      households: [household({ pendingInvoice: pending })],
    });
    actions.markInvoicePaidFn.mockResolvedValue({
      available: true,
      applied: false,
      invoiceStatus: "paid",
      subscriptionStatus: "active",
    });
    render(<PlatformAdminHouseholdsPage />);
    fireEvent.click(await screen.findByText("Mark paid"));
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "gcash" } });
    fireEvent.change(screen.getByLabelText("Note"), { target: { value: "ref 123" } });
    fireEvent.click(screen.getByText("Confirm payment"));
    await waitFor(() => expect(actions.markInvoicePaidFn).toHaveBeenCalledTimes(1));
    expect(actions.markInvoicePaidFn.mock.calls[0][0].data).toEqual({
      token: "tok",
      invoiceId: "i1",
      channel: "gcash",
      note: "ref 123",
    });
    await waitFor(() =>
      expect(toasts.success).toHaveBeenCalledWith(expect.stringMatching(/already/i)),
    );
  });
});
