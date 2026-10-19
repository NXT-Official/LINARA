// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Plan } from "../plan.types";
import { PricingPage } from "./pricing-page";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    hash,
    children,
  }: {
    to: string;
    hash?: string;
    search?: unknown;
    children: React.ReactNode;
  }) => <a href={`${to}${hash ? `#${hash}` : ""}`}>{children}</a>,
}));

afterEach(cleanup);

const plan = (over: Partial<Plan>): Plan => ({
  id: "p1",
  name: "Home",
  tagline: "For one household",
  inclusions: ["Pass and Board", "Payslips"],
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
  ...over,
});

describe("PricingPage", () => {
  it("says pricing is by conversation when the plans table is unavailable", () => {
    render(<PricingPage available={false} plans={[]} />);
    expect(screen.getByText("Pricing is by conversation for now.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Message us" }).getAttribute("href")).toBe("/faq");
  });

  it("says the same when no plan is published", () => {
    render(<PricingPage available plans={[]} />);
    expect(screen.getByText("Pricing is by conversation for now.")).toBeTruthy();
  });

  it("lists each published plan with its price sentence, inclusions and a sign-up link", () => {
    render(
      <PricingPage
        available
        plans={[
          plan({}),
          plan({ id: "p2", name: "Year", interval: "yearly", baseCentavos: 499000 }),
        ]}
      />,
    );
    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getAllByText("For one household")).toBeTruthy();
    expect(
      screen.getByText("₱499.00 per month, 1 helper included, ₱99.00 per extra helper"),
    ).toBeTruthy();
    expect(screen.getAllByText("Payslips")).toHaveLength(2);
    expect(screen.getByText(/₱4,990\.00 per year/)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Get started" })).toHaveLength(2);
    expect(screen.queryByText("Pricing is by conversation for now.")).toBeNull();
  });
});
