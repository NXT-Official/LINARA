// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Plan, PlatformSettings } from "../plan.types";
import { PlatformAdminPlansPage } from "./platform-admin-plans-page";

const actions = vi.hoisted(() => ({
  listAllPlansFn: vi.fn(),
  savePlanFn: vi.fn(),
  setPlanStatusFn: vi.fn(),
  getPlatformSettingsFn: vi.fn(),
  savePlatformSettingsFn: vi.fn(),
}));

vi.mock("../plan.actions", () => actions);
vi.mock("@/features/platform-admin/hooks/use-platform-admin-session", () => ({
  usePlatformAdminSession: () => ({
    status: "admin",
    token: "tok",
    userId: "u1",
    logOut: vi.fn(),
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const example: Plan = {
  id: "p1",
  name: "Home",
  tagline: "For one household",
  inclusions: ["Pass and Board"],
  interval: "monthly",
  baseCentavos: 49900,
  includedHelpers: 1,
  includedManagers: 2,
  includedHomes: null,
  extraHelperCentavos: 9900,
  extraManagerCentavos: null,
  extraHomeCentavos: null,
  trialDays: 0,
  isPublic: true,
  status: "active",
  sortOrder: 0,
};

const settings: PlatformSettings = {
  freeTierEnabled: true,
  freeHelperSeats: 1,
  freeManagerSeats: 1,
  supportEmail: null,
};

beforeEach(() => {
  actions.getPlatformSettingsFn.mockResolvedValue({ available: true, settings });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlatformAdminPlansPage", () => {
  it("says so when the plans table is not there yet", async () => {
    actions.listAllPlansFn.mockResolvedValue({ available: false, plans: [] });
    render(<PlatformAdminPlansPage />);
    expect(await screen.findByText(/Plans aren.t switched on yet/)).toBeTruthy();
  });

  it("shows the empty state with a way to add the first plan", async () => {
    actions.listAllPlansFn.mockResolvedValue({ available: true, plans: [] });
    render(<PlatformAdminPlansPage />);
    expect(await screen.findByText("No plans yet")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "New plan" }).length).toBeGreaterThan(0);
  });

  it("shows a load failure with a retry", async () => {
    actions.listAllPlansFn.mockRejectedValue(new Error("boom"));
    render(<PlatformAdminPlansPage />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("lists plans with status and price sentence", async () => {
    actions.listAllPlansFn.mockResolvedValue({ available: true, plans: [example] });
    render(<PlatformAdminPlansPage />);
    expect(await screen.findByText("Home")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(
      screen.getByText(
        "₱499.00 per month, 1 helper included, ₱99.00 per extra helper, 2 managers included",
      ),
    ).toBeTruthy();
  });

  it("previews what a household pays inside the form", async () => {
    actions.listAllPlansFn.mockResolvedValue({ available: true, plans: [example] });
    render(<PlatformAdminPlansPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit Home" }));
    expect(
      await screen.findByText("A household with 2 helpers, 1 manager, 1 home pays ₱598.00."),
    ).toBeTruthy();
  });

  it("refuses to save a plan with no name and says why", async () => {
    actions.listAllPlansFn.mockResolvedValue({ available: true, plans: [] });
    render(<PlatformAdminPlansPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: "New plan" }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Save plan" }));
    expect(await screen.findByText("Give the plan a name.")).toBeTruthy();
    expect(actions.savePlanFn).not.toHaveBeenCalled();
  });

  it("saves centavos converted from pesos", async () => {
    actions.listAllPlansFn.mockResolvedValue({ available: true, plans: [] });
    actions.savePlanFn.mockResolvedValue({ ...example, id: "new" });
    render(<PlatformAdminPlansPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: "New plan" }))[0]);
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Home" } });
    fireEvent.change(screen.getByLabelText("Base price (pesos)"), { target: { value: "499.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(actions.savePlanFn).toHaveBeenCalled());
    const arg = actions.savePlanFn.mock.calls[0][0] as { data: { token: string; plan: Plan } };
    expect(arg.data.token).toBe("tok");
    expect(arg.data.plan.baseCentavos).toBe(49950);
    expect(arg.data.plan.name).toBe("Home");
  });

  it("converts 19.99 pesos to 1999 centavos", async () => {
    actions.listAllPlansFn.mockResolvedValue({ available: true, plans: [] });
    actions.savePlanFn.mockResolvedValue({ ...example, id: "new" });
    render(<PlatformAdminPlansPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: "New plan" }))[0]);
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Cheap" } });
    fireEvent.change(screen.getByLabelText("Base price (pesos)"), { target: { value: "19.99" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(actions.savePlanFn).toHaveBeenCalled());
    const arg = actions.savePlanFn.mock.calls[0][0] as { data: { plan: Plan } };
    expect(arg.data.plan.baseCentavos).toBe(1999);
  });

  it("rejects a price with three decimals", async () => {
    actions.listAllPlansFn.mockResolvedValue({ available: true, plans: [] });
    render(<PlatformAdminPlansPage />);
    fireEvent.click((await screen.findAllByRole("button", { name: "New plan" }))[0]);
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "X" } });
    fireEvent.change(screen.getByLabelText("Base price (pesos)"), { target: { value: "19.999" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    expect(await screen.findByText("Use pesos with up to two decimals")).toBeTruthy();
    expect(actions.savePlanFn).not.toHaveBeenCalled();
  });
});
