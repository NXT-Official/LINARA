// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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

  it("shows revenue and a dash for a null cost per call", async () => {
    getAnalyticsFn.mockResolvedValue({ available: true, analytics });
    render(<PlatformAdminOverviewPage />);
    expect(await screen.findByText("₱697.00")).toBeTruthy();
    const row = screen.getByText("Cost per AI call").closest("li");
    expect(row?.textContent).toContain("—");
    expect(screen.getByText("sop")).toBeTruthy();
  });
});
