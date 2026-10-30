import { Link } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";
import { useEffect, useState } from "react";

import type { BillingCatalog } from "../plan.actions";
import { formatCentavos, limitTitle } from "../plan.logic";
import { ADDONS, CATALOG, FEATURES } from "../plan.sample";
import type { CatalogPlan, LimitKey } from "../plan.types";
import { useT } from "@/lib/i18n/locale-context";

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

function limitCell(value: number | null, noneLabel: string) {
  if (value === null) return "Unlimited";
  return value === 0 ? (
    <Minus className="mx-auto size-4 text-muted-foreground" aria-label={noneLabel} />
  ) : (
    value
  );
}

/**
 * The plans side by side for the landing page: what the database sells
 * (billing_catalog), or the built-in catalog where billing isn't set up yet.
 */
export function PlansComparison() {
  const t = useT();
  const [sold, setSold] = useState<BillingCatalog | null>(null);
  useEffect(() => {
    let cancelled = false;
    import("../plan.actions")
      .then((m) => m.getCatalogFn())
      .then((c) => {
        if (!cancelled && c?.plans.length) setSold(c);
      })
      .catch(() => {
        // Keeps the built-in catalog.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const plans = sold?.plans ?? CATALOG;
  const addons = sold?.addons ?? ADDONS;
  const addonNames = addons.map((a) => a.name.toLowerCase()).join(" or ");
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
          {t("plan.plansForEveryHousehold")}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          {t("plan.startFreeWithOneHousehold")}
        </p>
      </div>

      <div className="mt-10 overflow-hidden rounded-3xl bg-card shadow-soft">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">{t("plan.whatEachPlanIncludes")}</caption>
          <colgroup>
            <col />
            {plans.map((p) => (
              <col key={p.id} className="w-[23%] sm:w-[18%]" />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="p-4 align-bottom sm:p-6">
                <span className="sr-only">{t("plan.feature")}</span>
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
                  {limitTitle(k, t)}
                </th>
                {plans.map((p, i) => (
                  <td
                    key={p.id}
                    className={`px-2 py-4 text-center tabular-nums text-foreground sm:px-4 ${i === plans.length - 1 ? "bg-secondary/50" : ""}`}
                  >
                    {limitCell(p.limits[k], t("plan.none"))}
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
                        aria-label={t("plan.included")}
                      />
                    ) : (
                      <Minus
                        className="mx-auto size-4 text-muted-foreground"
                        aria-label={t("plan.notIncluded")}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-status-done-soft/40">
              <th scope="row" colSpan={plans.length + 1} className="p-4 sm:px-6">
                <span className="block font-semibold text-foreground">{t("plan.onEveryPlan")}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {t("plan.rightsNote", { rights: rights.map((f) => f.name).join(", ") })}
                </span>
              </th>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          {t("plan.needMoreRoom", { addons: addonNames })}
        </p>
        <Link
          to="/signup"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft transition-colors duration-150 ease-out hover:bg-pine-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px motion-reduce:active:translate-y-0"
        >
          {t("plan.startFree")}
        </Link>
      </div>
    </section>
  );
}
