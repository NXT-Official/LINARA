import { describe, expect, it } from "vitest";

import type { Analytics } from "./analytics.types";
import { rangeFor, seriesForChart } from "./analytics.utils";

describe("rangeFor", () => {
  const today = new Date(2026, 9, 19);
  it("this month runs first to last day", () => {
    expect(rangeFor("this_month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });
  it("last 3 months starts two months back", () => {
    expect(rangeFor("last_3_months", today)).toEqual({ from: "2026-08-01", to: "2026-10-31" });
  });
  it("this year runs January to December", () => {
    expect(rangeFor("this_year", today)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
  it("crosses a year boundary", () => {
    expect(rangeFor("last_3_months", new Date(2026, 0, 5))).toEqual({
      from: "2025-11-01",
      to: "2026-01-31",
    });
  });
});

describe("seriesForChart", () => {
  it("converts centavos to pesos and names the month", () => {
    const analytics = {
      series: [
        {
          month: "2026-10",
          revenueCentavos: 69700,
          cogsCentavos: 12050,
          profitCentavos: 57650,
          aiCalls: 3,
        },
      ],
    } as Analytics;
    expect(seriesForChart(analytics)).toEqual([
      { month: "Oct", revenue: 697, cogs: 120.5, profit: 576.5 },
    ]);
  });
});
