import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { RouteError } from "@/components/shared/route-error";
import { MyPlanPage } from "@/features/plan/pages/my-plan-page";
import { ADDONS } from "@/features/plan/plan.sample";

type PlanSearch = {
  /** An add-on to start buying, from a limit message ("Add one"). */
  addon?: string;
};

export const Route = createFileRoute("/_app/manager/plan")({
  validateSearch: (search: Record<string, unknown>): PlanSearch => ({
    addon: ADDONS.some((a) => a.id === search.addon) ? (search.addon as string) : undefined,
  }),
  head: () => ({ meta: [{ title: "Your plan | Linara" }] }),
  component: ManagerPlanRoute,
  errorComponent: RouteError,
});

function ManagerPlanRoute() {
  const { addon } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const clear = useCallback(() => {
    void navigate({ search: {}, replace: true });
  }, [navigate]);
  return <MyPlanPage buyAddon={addon} onBuyAddonUsed={clear} />;
}
