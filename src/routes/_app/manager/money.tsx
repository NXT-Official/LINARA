import { createFileRoute } from "@tanstack/react-router";

import { ManagerMoneyPage } from "@/features/dashboard/pages/manager-money-page";

export const Route = createFileRoute("/_app/manager/money")({
  component: ManagerMoneyPage,
});
