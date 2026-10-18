// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlatformAdminCostsPage } from "./platform-admin-costs-page";

const session = vi.hoisted(() => ({ status: "admin", token: "tok" }));
const actions = vi.hoisted(() => ({
  listCostEntriesFn: vi.fn(),
  listModelPricesFn: vi.fn(),
  saveCostEntryFn: vi.fn(),
  deleteCostEntryFn: vi.fn(),
  saveModelPriceFn: vi.fn(),
}));

vi.mock("../hooks/use-platform-admin-session", () => ({
  usePlatformAdminSession: () => ({ ...session, userId: "u", logOut: vi.fn() }),
}));
vi.mock("../analytics.actions", () => actions);

describe("PlatformAdminCostsPage", () => {
  beforeEach(() => {
    Object.values(actions).forEach((fn) => fn.mockReset());
    actions.listModelPricesFn.mockResolvedValue({ available: true, prices: [] });
  });
  afterEach(cleanup);

  it("says so when costs aren't switched on", async () => {
    actions.listCostEntriesFn.mockResolvedValue({ available: false, entries: [] });
    render(<PlatformAdminCostsPage />);
    expect(await screen.findByText(/aren.t switched on yet/)).toBeTruthy();
  });

  it("shows the empty state", async () => {
    actions.listCostEntriesFn.mockResolvedValue({ available: true, entries: [] });
    render(<PlatformAdminCostsPage />);
    expect(await screen.findByText("No costs recorded")).toBeTruthy();
  });

  it("lists rows with the amount", async () => {
    actions.listCostEntriesFn.mockResolvedValue({
      available: true,
      entries: [
        {
          id: "1",
          month: "2026-10-01",
          category: "infra",
          label: "Vercel Pro",
          amountCentavos: 150000,
          note: null,
        },
      ],
    });
    render(<PlatformAdminCostsPage />);
    expect(await screen.findByText("Vercel Pro")).toBeTruthy();
    expect(screen.getByText("₱1,500.00")).toBeTruthy();
  });

  const oneRow = {
    available: true,
    entries: [
      {
        id: "1",
        month: "2026-10-01",
        category: "infra",
        label: "Vercel Pro",
        amountCentavos: 150000,
        note: null,
      },
    ],
  };

  it("deletes only after a confirm", async () => {
    actions.listCostEntriesFn.mockResolvedValue(oneRow);
    actions.deleteCostEntryFn.mockResolvedValue({ available: true });
    render(<PlatformAdminCostsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Vercel Pro" }));
    expect(actions.deleteCostEntryFn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete cost" }));
    await waitFor(() => expect(screen.queryByText("Vercel Pro")).toBeNull());
    expect(actions.deleteCostEntryFn).toHaveBeenCalledTimes(1);
  });

  it("keeps the row when the delete removed nothing", async () => {
    actions.listCostEntriesFn.mockResolvedValue(oneRow);
    actions.deleteCostEntryFn.mockRejectedValue(new Error("Couldn't delete the cost"));
    render(<PlatformAdminCostsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete Vercel Pro" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete cost" }));
    await waitFor(() => expect(actions.deleteCostEntryFn).toHaveBeenCalled());
    expect(screen.getByText("Vercel Pro")).toBeTruthy();
  });

  it("rejects a malformed amount", async () => {
    actions.listCostEntriesFn.mockResolvedValue({ available: true, entries: [] });
    render(<PlatformAdminCostsPage />);
    await screen.findByText("No costs recorded");
    fireEvent.click(screen.getAllByRole("button", { name: "Add cost" })[0]);
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "Rent" } });
    fireEvent.change(screen.getByLabelText("Month"), { target: { value: "2026-10" } });
    fireEvent.change(screen.getByLabelText("Amount (₱)"), { target: { value: "1,200" } });
    fireEvent.click(screen.getByRole("button", { name: "Save cost" }));
    expect(await screen.findByText("Enter an amount like 1200 or 1200.50.")).toBeTruthy();
    expect(actions.saveCostEntryFn).not.toHaveBeenCalled();
  });

  it("validates the add-cost form", async () => {
    actions.listCostEntriesFn.mockResolvedValue({ available: true, entries: [] });
    render(<PlatformAdminCostsPage />);
    await screen.findByText("No costs recorded");
    fireEvent.click(screen.getAllByRole("button", { name: "Add cost" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save cost" }));
    expect(await screen.findByText("Add a label.")).toBeTruthy();
    expect(actions.saveCostEntryFn).not.toHaveBeenCalled();
  });
});
