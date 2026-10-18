import type { Analytics, RangePreset } from "./analytics.types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** ISO first/last day for a preset, in the viewer's local calendar. */
export function rangeFor(preset: RangePreset, today: Date): { from: string; to: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  if (preset === "this_year") return { from: iso(y, 1, 1), to: iso(y, 12, 31) };
  const start = preset === "this_month" ? new Date(y, m, 1) : new Date(y, m - 2, 1);
  const lastDay = new Date(y, m + 1, 0).getDate();
  return {
    from: iso(start.getFullYear(), start.getMonth() + 1, 1),
    to: iso(y, m + 1, lastDay),
  };
}

export type ChartPoint = { month: string; revenue: number; cogs: number; profit: number };

/** Chart rows in pesos with short month names. */
export function seriesForChart(analytics: Analytics): ChartPoint[] {
  return analytics.series.map((p) => {
    const index = Number(p.month.slice(5, 7)) - 1;
    return {
      month: MONTHS[index] ?? p.month,
      revenue: p.revenueCentavos / 100,
      cogs: p.cogsCentavos / 100,
      profit: p.profitCentavos / 100,
    };
  });
}

/** "2026-10-01" to "October 2026". */
export function monthHeading(isoDate: string): string {
  const index = Number(isoDate.slice(5, 7)) - 1;
  const full = new Date(2000, index, 1).toLocaleString("en-US", { month: "long" });
  return `${full} ${isoDate.slice(0, 4)}`;
}
