// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GroceryContext } from "../grocery-context";
import type { GroceryContextValue, GroceryItem, GroceryRun } from "../grocery.types";
import { RunModal } from "./run-modal";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/features/dashboard/app-store-context", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAppStores: () => ({
    activeHelpers: [],
    teams: { available: false, teams: [], teamById: new Map() },
    board: { tasks: [] },
  }),
}));
vi.mock("./receipt-slot", () => ({ ReceiptSlot: () => null }));

const run: GroceryRun = {
  id: "r1",
  title: "Saturday palengke",
  status: "ready",
  teamId: null,
  shopOn: null,
  ticketId: null,
  templateId: null,
  cashGiven: 500,
  changeReturned: null,
  note: "",
  shopperIds: [],
  createdByName: null,
  approvedByName: null,
  closedByName: null,
  createdAt: "2026-10-07T00:00:00Z",
  closedAt: null,
};

const line = (over: Partial<GroceryItem>): GroceryItem => ({
  id: Math.random().toString(36),
  name: "Bigas",
  qty: 1,
  unit: "kg",
  bought: true,
  runId: "r1",
  ...over,
});

const open = (items: GroceryItem[]) => {
  const setRunStatus = vi.fn(async () => {});
  const ctx = {
    runsAvailable: true,
    needed: [],
    itemsByRun: new Map([["r1", items]]),
    setRunStatus,
  } as unknown as GroceryContextValue;
  render(
    <GroceryContext.Provider value={ctx}>
      <RunModal run={run} onClose={vi.fn()} />
    </GroceryContext.Provider>,
  );
  return { setRunStatus };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RunModal petty cash", () => {
  it("says the expected change in words and fills it in on request", () => {
    open([line({ costPHP: 100 }), line({ name: "Itlog", costPHP: 50 })]);
    expect(screen.getByText("Expected back:")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use ₱350" }));
    expect((screen.getByLabelText("Change returned") as HTMLInputElement).value).toBe("350");
    expect(screen.getByText("It balances.")).toBeTruthy();
  });

  it("names lines with no cost instead of calling the gap missing money", () => {
    open([line({ costPHP: 100 }), line({ name: "Itlog" })]);
    expect(screen.getByText(/1 bought line has no cost yet/)).toBeTruthy();
    // No change to accept while the spend is incomplete.
    expect(screen.queryByRole("button", { name: /^Use / })).toBeNull();
    fireEvent.change(screen.getByLabelText("Change returned"), { target: { value: "350" } });
    expect(screen.queryByText(/not accounted for/)).toBeNull();
  });

  it("keeps the cash in one place and saves an edited amount on close", async () => {
    const { setRunStatus } = open([line({ costPHP: 150 })]);
    expect(screen.queryByText("Cash given (₱)")).toBeNull();
    fireEvent.change(screen.getByLabelText("Cash given"), { target: { value: "600" } });
    fireEvent.change(screen.getByLabelText("Change returned"), { target: { value: "450" } });
    expect(screen.getByText("It balances.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close run" }));
    await waitFor(() =>
      expect(setRunStatus).toHaveBeenCalledWith(run, "done", {
        cashGiven: 600,
        changeReturned: 450,
      }),
    );
  });
});
