import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { listPublicPlansFn } from "@/features/billing/plan.actions";
import { PricingPage } from "@/features/billing/pages/pricing-page";
import { loadPublicPlans } from "@/features/billing/public-plans-loader";

export const Route = createFileRoute("/pricing")({
  loader: () => loadPublicPlans(() => listPublicPlansFn({ data: {} })),
  head: () => ({
    meta: [
      { title: "Pricing | Linara" },
      { name: "description", content: "What Linara costs, in pesos, with tax included." },
    ],
  }),
  component: PricingRoute,
  errorComponent: RouteError,
});

function PricingRoute() {
  const { available, plans } = Route.useLoaderData();
  return <PricingPage available={available} plans={plans} />;
}
