import { Link } from "@tanstack/react-router";

import { LogoMark } from "@/components/shared/logo";

import { PlanCard } from "../components/plan-card";
import type { Plan } from "../plan.types";

/**
 * Public /pricing. Shows only what a Linara admin published: with nothing
 * published (or the plans table not there yet) it says pricing is by
 * conversation, and never invents a number (PRODUCT.md).
 */
export function PricingPage({ available, plans }: { available: boolean; plans: Plan[] }) {
  const hasPlans = available && plans.length > 0;
  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Linara home"
        >
          <LogoMark className="h-8 w-8" />
          <span className="font-wordmark text-xl font-semibold text-primary">linara</span>
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-primary">Pricing</h1>
        {hasPlans ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Prices are in pesos and final: tax is already included.
            </p>

            <ul className="mt-8 divide-y divide-border/60 rounded-3xl border border-border/60 bg-card shadow-soft">
              {plans.map((plan) => (
                <PlanCard key={plan.id} plan={plan} />
              ))}
            </ul>
          </>
        ) : (
          <section className="mt-8 rounded-3xl border border-border/60 bg-card p-6 shadow-soft sm:p-8">
            <h2 className="font-display text-xl text-foreground">
              Pricing is by conversation for now.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Tell us about your household and we will work out what fits.
            </p>
            <Link
              to="/faq"
              className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Message us
            </Link>
          </section>
        )}
      </main>
    </div>
  );
}
