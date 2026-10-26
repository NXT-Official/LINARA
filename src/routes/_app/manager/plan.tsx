import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { MyPlanPage } from "@/features/plan/pages/my-plan-page";

export const Route = createFileRoute("/_app/manager/plan")({
  head: () => ({ meta: [{ title: "Your plan | Linara" }] }),
  component: MyPlanPage,
  errorComponent: RouteError,
});
