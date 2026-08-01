import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { HelperTodayPage } from "@/features/dashboard/pages/helper-today-page";

export const Route = createFileRoute("/_app/helper/today")({
  head: () => ({ meta: [{ title: "Today | Linara" }] }),
  component: HelperTodayPage,
  errorComponent: RouteError,
});
