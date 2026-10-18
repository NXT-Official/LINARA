// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Analytics } from "../analytics.types";
import { PlatformAdminOverviewPage } from "./platform-admin-overview-page";

const session = vi.hoisted(() => ({ status: "admin", token: "tok" }));
const getAnalyticsFn = vi.hoisted(() => vi.fn());

vi.mock("../hooks/use-platform-admin-session", () => ({
  usePlatformAdminSession: () => ({ ...session, userId: "u", logOut: vi.fn() }),
}));
vi.mock("../analytics.actions", () => ({ getAnalyticsFn }));
vi.mock("../components/analytics-chart", () => ({ AnalyticsChart: () => <div>chart</div> }));

const analytics: Analytics = {
  revenueCentavos: 69700,
  cogsCentavos: 10000,
  costEntriesCentavos: 4000,
  aiCostCentavos: 6000,
  aiCalls: 12,
  costPerCallCentavos: null,
  profitCentavos: 59700,
  payingHouseholds: 2,
  users: 5,
  profitPerUserCentavos: null,
  series: [],
  aiByFn: [{ fn: "sop", calls: 12, costCentavos: 6000, inputTokens: 100, outputTokens: 50 }],
};

describe("PlatformAdminOverviewPage", () => {
  beforeEach(() => {
    session.status = "admin";
    getAnalyticsFn.mockReset();
  });
  afterEach(cleanup);

  it("shows loading while the figures load", () => {
    getAnalyticsFn.mockReturnValue(new Promise(() => undefined));
    render(<PlatformAdminOverviewPage />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("says so when analytics aren't switched on", async () => {
    getAnalyticsFn.mockResolvedValue({ available: false, analytics: null });
    render(<PlatformAdminOverviewPage />);
    expect(await screen.findByText(/aren.t switched on yet/)).toBeTruthy();
  });

  it("shows an error with retry", async () => {
    getAnalyticsFn.mockRejectedValue(new Error("boom"));
    render(<PlatformAdminOverviewPage />);
    expect(await screen.findByText(/Couldn.t load the analytics/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("keeps the newest answer when an older request resolves last", async () => {
    const resolvers: ((v: unknown) => void)[] = [];
    getAnalyticsFn.mockImplementation(() => new Promise((resolve) => resolvers.push(resolve)));
    render(<PlatformAdminOverviewPage />);
    fireEvent.click(screen.getByRole("button", { name: "This year" }));
    const answer = (revenueCentavos: number) => ({
      available: true,
      analytics: { ...analytics, revenueCentavos },
    });
    resolvers[1](answer(100000));
    expect(await screen.findByText("₱1,000.00")).toBeTruthy();
    resolvers[0](answer(50000));
    await Promise.resolve();
    expect(screen.getByText("₱1,000.00")).toBeTruthy();
    expect(screen.queryByText("₱500.00")).toBeNull();
  });

  it("shows revenue and a dash for a null cost per call", async () => {
    getAnalyticsFn.mockResolvedValue({ available: true, analytics });
    render(<PlatformAdminOverviewPage />);
    expect(await screen.findByText("₱697.00")).toBeTruthy();
    const row = screen.getByText("Cost per AI call").closest("li");
    expect(row?.textContent).toContain("—");
    expect(screen.getByText("sop")).toBeTruthy();
  });

  it("defines paying households and users as the database counts them", async () => {
    getAnalyticsFn.mockResolvedValue({ available: true, analytics });
    render(<PlatformAdminOverviewPage />);
    const paying = (await screen.findByText("Paying households")).closest("li");
    expect(paying?.textContent).toContain(
      "Covered by a paid plan at any point in the range (₱0 comps excluded).",
    );
    const users = screen.getByText("Users").closest("li");
    expect(users?.textContent).toContain("Distinct managers of those households.");
    expect(screen.queryByText(/helpers with an account/)).toBeNull();
  });
});
