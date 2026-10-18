import { createFileRoute } from "@tanstack/react-router";

import { paidFlag } from "@/features/billing/billing.types";
import { RouteError } from "@/components/shared/route-error";
import { ManagerPlanPage } from "@/features/billing/pages/manager-plan-page";

type PlanSearch = {
  /** Set by Xendit's return page: "1" paid, "0" not. */
  paid?: "1" | "0";
};

export const Route = createFileRoute("/_app/manager/plan")({
  validateSearch: (search: Record<string, unknown>): PlanSearch => ({
    paid: paidFlag(search.paid),
  }),
  head: () => ({ meta: [{ title: "Plan & billing | Linara" }] }),
  component: ManagerPlanRoute,
  errorComponent: RouteError,
});

function ManagerPlanRoute() {
  const { paid } = Route.useSearch();
  return <ManagerPlanPage paid={paid} />;
}
