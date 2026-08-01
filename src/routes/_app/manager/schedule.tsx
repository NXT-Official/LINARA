import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { ManagerSchedulePage } from "@/features/dashboard/pages/manager-schedule-page";

export const Route = createFileRoute("/_app/manager/schedule")({
  head: () => ({ meta: [{ title: "Schedule | Linara" }] }),
  component: ManagerSchedulePage,
  errorComponent: RouteError,
});
