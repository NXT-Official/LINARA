import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { fmtCentavos } from "@/features/billing/money";

import type { Analytics } from "../analytics.types";
import { seriesForChart } from "../analytics.utils";

// Theme tokens, not hex: pine (dark teal) vs terracotta differ by hue and by
// lightness, and the profit line is ink so it reads against both bars.
const config = {
  revenue: { label: "Revenue", color: "var(--pine)" },
  cogs: { label: "COGS", color: "var(--terracotta)" },
  profit: { label: "Profit", color: "var(--ink)" },
} satisfies ChartConfig;

const pesos = (v: number) => `₱${v.toLocaleString("en-US")}`;

/** Revenue and COGS bars per month, profit as a line, all on one peso axis. */
export function AnalyticsChart({ analytics }: { analytics: Analytics }) {
  const data = seriesForChart(analytics);

  if (data.length === 0) {
    return <p className="p-6 text-sm text-muted-foreground">No months in this range yet.</p>;
  }

  return (
    <ChartContainer
      config={config}
      className="aspect-auto h-72 w-full"
      role="img"
      aria-label="Monthly revenue, COGS and profit in pesos"
    >
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} fontSize={13} />
        <YAxis
          width={64}
          tickLine={false}
          axisLine={false}
          fontSize={13}
          tickFormatter={pesos}
          label={{
            value: "Pesos (₱)",
            angle: -90,
            position: "insideLeft",
            offset: 8,
            style: { fontSize: 13, fill: "var(--muted-foreground)" },
          }}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-[2px]"
                      style={{ background: `var(--color-${String(name)})` }}
                    />
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="font-mono font-medium text-foreground">
                    {fmtCentavos(Math.round(Number(value) * 100))}
                  </span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="cogs" fill="var(--color-cogs)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Line
          dataKey="profit"
          type="monotone"
          stroke="var(--color-profit)"
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 2, stroke: "var(--card)", fill: "var(--color-profit)" }}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
