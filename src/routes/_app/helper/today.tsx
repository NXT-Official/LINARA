import { createFileRoute } from "@tanstack/react-router";

import { HelperTodayPage } from "@/features/dashboard/pages/helper-today-page";

export const Route = createFileRoute("/_app/helper/today")({
  component: HelperTodayPage,
});
