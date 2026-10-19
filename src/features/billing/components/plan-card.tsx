import { Link } from "@tanstack/react-router";

import { describePlanPricing } from "../plan.pricing";
import type { Plan } from "../plan.types";

/** One published plan on /pricing: a row of the pricing surface, not a card of its own. */
export function PlanCard({ plan }: { plan: Plan }) {
  return (
    <li className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-xl text-foreground">{plan.name}</h2>
          {plan.tagline && <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>}
          <p className="mt-3 text-sm font-semibold text-foreground">{describePlanPricing(plan)}</p>
          {plan.trialDays > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {plan.trialDays} {plan.trialDays === 1 ? "day" : "days"} free to try it first.
            </p>
          )}
        </div>
        <Link
          to="/signup"
          search={{ step: "household" }}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
        >
          Get started
        </Link>
      </div>
      {plan.inclusions.length > 0 && (
        <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
          {plan.inclusions.map((line, i) => (
            <li key={`${i}-${line}`} className="py-2.5 text-sm text-foreground">
              {line}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
