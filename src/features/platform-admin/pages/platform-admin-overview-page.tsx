import { useCallback, useEffect, useMemo, useState } from "react";

import { Field } from "@/components/shared/field";
import { fmtCentavos } from "@/features/billing/money";

import { getAnalyticsFn } from "../analytics.actions";
import type { Analytics, RangePreset } from "../analytics.types";
import { rangeFor } from "../analytics.utils";
import { AnalyticsChart } from "../components/analytics-chart";
import { usePlatformAdminSession } from "../hooks/use-platform-admin-session";

type Load =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "unavailable" }
  | { kind: "ready"; analytics: Analytics };

type Choice = RangePreset | "custom";

const CHOICES: { id: Choice; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_3_months", label: "Last 3 months" },
  { id: "this_year", label: "This year" },
  { id: "custom", label: "Custom" },
];

const actionCls =
  "rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50";
const inputCls =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground";

const money = (c: number | null) => (c === null ? "—" : fmtCentavos(c));
const count = (n: number) => n.toLocaleString("en-US");

type Figure = { label: string; value: string; definition: string };

function figuresFor(a: Analytics): Figure[] {
  return [
    {
      label: "Revenue",
      value: money(a.revenueCentavos),
      definition: "Plan payments received in this range.",
    },
    {
      label: "COGS",
      value: money(a.cogsCentavos),
      definition: "What it cost to serve those households: AI use plus the costs you logged.",
    },
    {
      label: "of which AI",
      value: money(a.aiCostCentavos),
      definition: "AI calls priced from the model prices you set.",
    },
    {
      label: "AI calls",
      value: count(a.aiCalls),
      definition: "Calls to the AI in this range.",
    },
    {
      label: "Cost per AI call",
      value: money(a.costPerCallCentavos),
      definition: "AI cost divided by AI calls. A dash means no calls yet.",
    },
    {
      label: "Profit",
      value: money(a.profitCentavos),
      definition: "Revenue minus COGS.",
    },
    {
      label: "Paying households",
      value: count(a.payingHouseholds),
      definition: "Households on a paid plan right now.",
    },
    {
      label: "Users",
      value: count(a.users),
      definition: "Managers and helpers with an account.",
    },
    {
      label: "Profit per user",
      value: money(a.profitPerUserCentavos),
      definition: "Profit divided by users. A dash means no users yet.",
    },
  ];
}

/** Linara admin: the money in, the money out, and what the AI costs. */
export function PlatformAdminOverviewPage() {
  const { status, token } = usePlatformAdminSession();
  const initial = useMemo(() => rangeFor("this_month", new Date()), []);
  const [choice, setChoice] = useState<Choice>("this_month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  const rangeError =
    !from || !to ? "Pick both dates." : from > to ? "Start must be before end." : null;

  const refresh = useCallback(async () => {
    if (!token || rangeError) return;
    setLoad({ kind: "loading" });
    try {
      const res = await getAnalyticsFn({ data: { token, from, to } });
      setLoad(
        res.available && res.analytics
          ? { kind: "ready", analytics: res.analytics }
          : { kind: "unavailable" },
      );
    } catch {
      setLoad({ kind: "error" });
    }
  }, [token, from, to, rangeError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function pick(next: Choice) {
    setChoice(next);
    if (next !== "custom") {
      const r = rangeFor(next, new Date());
      setFrom(r.from);
      setTo(r.to);
    }
  }

  if (status === "loading") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading analytics…
      </p>
    );
  }
  if (!token) return null;

  return (
    <div className="space-y-8">
      <section aria-labelledby="overview-heading">
        <h1 id="overview-heading" className="font-display text-2xl text-foreground">
          Overview
        </h1>
        <div role="group" aria-label="Date range" className="mt-4 flex flex-wrap gap-2">
          {CHOICES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={choice === c.id}
              onClick={() => pick(c.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
                choice === c.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-foreground hover:bg-muted"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {choice === "custom" && (
          <div className="mt-4 grid max-w-md grid-cols-2 gap-3">
            <Field label="From" error={rangeError}>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                aria-invalid={rangeError !== null}
                className={inputCls}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                aria-invalid={rangeError !== null}
                className={inputCls}
              />
            </Field>
          </div>
        )}
      </section>

      {load.kind === "loading" && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading analytics…
        </p>
      )}
      {load.kind === "error" && (
        <div
          role="alert"
          className="rounded-3xl border border-border/60 bg-card p-6 text-sm shadow-soft"
        >
          <p className="text-foreground">Couldn&rsquo;t load the analytics.</p>
          <button type="button" className={`${actionCls} mt-3`} onClick={() => void refresh()}>
            Try again
          </button>
        </div>
      )}
      {load.kind === "unavailable" && (
        <p className="rounded-3xl border border-border/60 bg-card p-6 text-sm text-muted-foreground shadow-soft">
          Analytics aren&rsquo;t switched on yet. Apply the platform analytics SQL, then reload.
        </p>
      )}

      {load.kind === "ready" && (
        <>
          <section aria-labelledby="figures-heading">
            <h2 id="figures-heading" className="font-display text-xl text-foreground">
              Figures
            </h2>
            <ul className="mt-3 divide-y divide-border/60 rounded-3xl border border-border/60 bg-card shadow-soft">
              {figuresFor(load.analytics).map((f) => (
                <li key={f.label} className="flex items-start justify-between gap-4 p-4 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{f.label}</p>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">{f.definition}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-foreground">{f.value}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="chart-heading">
            <h2 id="chart-heading" className="font-display text-xl text-foreground">
              By month
            </h2>
            <div className="mt-3 rounded-3xl border border-border/60 bg-card p-3 shadow-soft sm:p-4">
              <AnalyticsChart analytics={load.analytics} />
            </div>
          </section>

          <section aria-labelledby="ai-heading">
            <h2 id="ai-heading" className="font-display text-xl text-foreground">
              AI by function
            </h2>
            <div className="mt-3 rounded-3xl border border-border/60 bg-card shadow-soft">
              {load.analytics.aiByFn.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground">No AI calls in this range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border/60 text-[13px] text-muted-foreground">
                        <th scope="col" className="px-4 py-3 font-semibold sm:px-5">
                          Function
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-semibold">
                          Calls
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-semibold">
                          Cost
                        </th>
                        <th scope="col" className="px-3 py-3 text-right font-semibold">
                          Input tokens
                        </th>
                        <th scope="col" className="px-4 py-3 text-right font-semibold sm:px-5">
                          Output tokens
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {load.analytics.aiByFn.map((r) => (
                        <tr key={r.fn}>
                          <th
                            scope="row"
                            className="px-4 py-3 font-semibold text-foreground sm:px-5"
                          >
                            {r.fn}
                          </th>
                          <td className="px-3 py-3 text-right">{count(r.calls)}</td>
                          <td className="px-3 py-3 text-right">{fmtCentavos(r.costCentavos)}</td>
                          <td className="px-3 py-3 text-right">{count(r.inputTokens)}</td>
                          <td className="px-4 py-3 text-right sm:px-5">{count(r.outputTokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
