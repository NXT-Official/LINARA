// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

import { PlansComparison } from "./components/plans-comparison";

afterEach(cleanup);

const table = () => within(screen.getByRole("table", { name: "What each plan includes" }));
const row = (name: RegExp | string) => table().getByRole("row", { name });

describe("PlansComparison (landing page)", () => {
  it("lists Free, Normal and Premium side by side", () => {
    render(<PlansComparison />);
    const names = table()
      .getAllByRole("columnheader")
      .slice(1)
      .map((h) => h.querySelector("span")?.textContent);
    expect(names).toEqual(["Free", "Normal", "Premium"]);
  });

  it("never publishes the placeholder prices", () => {
    render(<PlansComparison />);
    expect(screen.queryByText(/₱199|₱399|₱1,990|₱3,990/)).toBeNull();
    expect(screen.getAllByText("coming soon")).toHaveLength(2);
    expect(screen.getByText("₱0")).toBeTruthy();
  });

  it("compares limits and features from the same catalog the app uses", () => {
    render(<PlansComparison />);
    expect(
      within(row(/^Kasambahay/))
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["1", "3", "Unlimited"]);
    const pantry = within(row(/Pantry and groceries/));
    expect(
      pantry.getAllByLabelText(/Included|Not included/).map((i) => i.getAttribute("aria-label")),
    ).toEqual(["Not included", "Included", "Included"]);
  });

  it("says a kasambahay's rest, leave and record are on every plan, not a column", () => {
    render(<PlansComparison />);
    expect(table().getByText("On every plan")).toBeTruthy();
    expect(
      table().getByText(/Leave and rest days, After-hours ledger, Work record export/),
    ).toBeTruthy();
    expect(table().queryByRole("row", { name: /^Leave and rest days/ })).toBeNull();
    expect(table().queryByRole("row", { name: /^Staff pay/ })).toBeNull();
  });
});
