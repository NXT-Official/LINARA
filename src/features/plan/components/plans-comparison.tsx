import { Link } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";

import { formatCentavos, LIMIT_LABEL } from "../plan.logic";
import { ADDONS, CATALOG, FEATURES } from "../plan.sample";
import type { CatalogPlan, LimitKey } from "../plan.types";

/**
 * A plan's price for the public page. Placeholder prices aren't shown: no
 * pricing may be published until marketing sets it (PRODUCT.md, Evidence).
 */
function publicPrice(plan: CatalogPlan): { main: string; sub: string } {
  if (plan.prices.monthly === 0) return { main: formatCentavos(0), sub: "for good" };
  if (plan.pricePlaceholder) return { main: "Price", sub: "coming soon" };
  return { main: formatCentavos(plan.prices.monthly ?? 0), sub: "a month" };
}

const LIMIT_ROWS: LimitKey[] = ["households", "kasambahay", "co_managers"];

function limitCell(value: number | null) {
  if (value === null) return "Unlimited";
  return value === 0 ? (
    <Minus className="mx-auto size-4 text-muted-foreground" aria-label="None" />
  ) : (
    value
  );
}

/** The plans side by side for the landing page, from the same catalog the app uses. */
export function PlansComparison() {
  const plans = CATALOG;
  const rights = FEATURES.filter((f) => f.everyPlan);
  const byPlan = FEATURES.filter((f) => !f.everyPlan && !f.offForEveryone);

  return (
    <section
      className="mx-auto max-w-7xl px-6 py-16 lg:py-24"
      aria-labelledby="plans-title"
      id="plans"
    >
      <div className="max-w-2xl">
        <h2
          id="plans-title"
          className="font-display text-3xl font-semibold text-primary sm:text-4xl"
        >
          Plans for every household
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Start free with one household. The manager pays; kasambahay never do, and every plan keeps
          their rest, leave and record theirs.
        </p>
      </div>

      <div className="mt-10 overflow-hidden rounded-3xl bg-card shadow-soft">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">What each plan includes</caption>
          <colgroup>
            <col />
            {plans.map((p) => (
              <col key={p.id} className="w-[23%] sm:w-[18%]" />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="p-4 align-bottom sm:p-6">
                <span className="sr-only">Feature</span>
              </th>
              {plans.map((p, i) => {
                const price = publicPrice(p);
                return (
                  <th
                    key={p.id}
                    scope="col"
                    className={`px-1 py-4 text-center align-bottom sm:px-4 sm:py-6 ${i === plans.length - 1 ? "bg-secondary/50" : ""}`}
                  >
                    <span className="block font-display text-sm font-semibold break-words text-primary sm:text-xl">
                      {p.name}
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-foreground tabular-nums sm:text-base">
                      {price.main}
                    </span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {price.sub}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {LIMIT_ROWS.map((k) => (
              <tr key={k} className="transition-colors hover:bg-secondary/30">
                <th scope="row" className="p-4 font-semibold text-foreground sm:px-6">
                  {LIMIT_LABEL[k].title}
                </th>
                {plans.map((p, i) => (
                  <td
                    key={p.id}
                    className={`px-2 py-4 text-center tabular-nums text-foreground sm:px-4 ${i === plans.length - 1 ? "bg-secondary/50" : ""}`}
                  >
                    {limitCell(p.limits[k])}
                  </td>
                ))}
              </tr>
            ))}
            {byPlan.map((f) => (
              <tr key={f.key} className="transition-colors hover:bg-secondary/30">
                <th scope="row" className="p-4 font-normal sm:px-6">
                  <span className="block font-semibold text-foreground">{f.name}</span>
                  <span className="hidden text-xs text-muted-foreground sm:block">
                    {f.description}
                  </span>
                </th>
                {plans.map((p, i) => (
                  <td
                    key={p.id}
                    className={`px-2 py-4 text-center sm:px-4 ${i === plans.length - 1 ? "bg-secondary/50" : ""}`}
                  >
                    {p.features[f.key] ? (
                      <Check
                        className="mx-auto size-4 text-status-done-ink"
                        aria-label="Included"
                      />
                    ) : (
                      <Minus
                        className="mx-auto size-4 text-muted-foreground"
                        aria-label="Not included"
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-status-done-soft/40">
              <th scope="row" colSpan={plans.length + 1} className="p-4 sm:px-6">
                <span className="block font-semibold text-foreground">On every plan</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {rights.map((f) => f.name).join(", ")}. A kasambahay&apos;s weekly rest day and
                  yearly leave are hers by law (RA 10361), and her record is hers to keep.
                </span>
              </th>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          Need a little more room on Normal or Premium? Add{" "}
          {ADDONS.map((a) => a.name.toLowerCase()).join(" or ")} to your plan any time. Staff pay
          &amp; HR is switched off for now while it&apos;s brought in line with the law.
        </p>
        <Link
          to="/signup"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft transition-colors duration-150 ease-out hover:bg-pine-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px motion-reduce:active:translate-y-0"
        >
          Start free
        </Link>
      </div>
    </section>
  );
}
