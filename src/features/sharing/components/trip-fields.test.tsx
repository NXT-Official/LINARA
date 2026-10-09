// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppStoreContext } from "@/features/dashboard/app-store-context";

import { TripFields } from "./trip-fields";

const stores = {
  session: { householdId: "h1" },
  sharing: {
    available: true,
    family: [
      { id: "h1", name: "Main House" },
      { id: "h2", name: "Beach House" },
    ],
    places: [
      { id: "p1", name: "School" },
      { id: "p2", name: "Office" },
    ],
  },
} as unknown as React.ContextType<typeof AppStoreContext>;

afterEach(cleanup);

const choices = (label: string) =>
  within(screen.getByLabelText(label))
    .getAllByRole("option")
    .map((o) => o.textContent);

describe("TripFields", () => {
  it("won't offer the same place for both ends (LM-A12)", () => {
    render(
      <AppStoreContext.Provider value={stores}>
        <TripFields
          from={{ kind: "place", id: "p1" }}
          to={{ kind: "house", id: "h2" }}
          onChange={vi.fn()}
        />
      </AppStoreContext.Provider>,
    );
    expect(choices("From")).toEqual(["Choose…", "Main House (this house)", "School", "Office"]);
    expect(choices("To")).toEqual(["Choose…", "Main House (this house)", "Beach House", "Office"]);
  });
});
