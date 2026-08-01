import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { ManagerMoneyPage } from "@/features/dashboard/pages/manager-money-page";

export const Route = createFileRoute("/_app/manager/money")({
  head: () => ({ meta: [{ title: "Money | Linara" }] }),
  component: ManagerMoneyPage,
  errorComponent: RouteError,
});
