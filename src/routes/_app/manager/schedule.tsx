import { createFileRoute } from "@tanstack/react-router";

import { ManagerSchedulePage } from "@/features/dashboard/pages/manager-schedule-page";

export const Route = createFileRoute("/_app/manager/schedule")({
  component: ManagerSchedulePage,
});
