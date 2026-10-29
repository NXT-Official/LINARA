// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GroceryContext } from "../grocery-context";
import type { GroceryContextValue } from "../grocery.types";

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
// The lists' own content isn't what's tested here.
vi.mock("./needed-list", () => ({ NeededList: () => <div>Needed list</div> }));
vi.mock("./runs-list", () => ({ RunsList: () => null }));
vi.mock("./repeats-list", () => ({ RepeatsList: () => null }));
vi.mock("./history-view", () => ({ HistoryView: () => null }));
vi.mock("./month-budget", () => ({ MonthBudget: () => <div>Month budget</div> }));
vi.mock("./run-modal", () => ({ RunModal: () => null }));

import { GrocerySection } from "./grocery-section";

afterEach(cleanup);

function show(over: Partial<GroceryContextValue> = {}) {
  const ctx = {
    runsAvailable: true,
    needed: [],
    toBuyCount: 0,
    runs: [],
    templates: [],
    spent: 0,
    ...over,
  } as unknown as GroceryContextValue;
  return render(
    <GroceryContext.Provider value={ctx}>
      <GrocerySection />
    </GroceryContext.Provider>,
  );
}

describe("the grocery list in a new household", () => {
  it("is one line and one action, not empty tabs, a budget and a form", () => {
    show();
    expect(screen.getByText(/What runs low in the pantry lands here/)).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Month budget")).toBeNull();
    expect(screen.queryByText("Needed list")).toBeNull();
  });

  it("Add an item opens the list to add by hand", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Add an item" }));
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getByText("Needed list")).toBeTruthy();
  });

  it("no decorative icon tile beside the heading", () => {
    const { container } = show();
    expect(container.querySelector("h2")?.previousElementSibling).toBeNull();
  });
});

describe("once there's anything", () => {
  it.each([
    ["something to buy", { needed: [{ id: "g1" }], toBuyCount: 1 }],
    ["a run", { runs: [{ id: "r1", status: "open" }] }],
    ["a weekly repeat", { templates: [{ id: "t1" }] }],
    ["money spent this month", { spent: 50_000 }],
  ] as const)("with %s, the full list shows", (_, over) => {
    show(over as unknown as Partial<GroceryContextValue>);
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getByText("Month budget")).toBeTruthy();
  });
});
