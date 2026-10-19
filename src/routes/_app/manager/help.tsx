import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { ManagerHelpPage } from "@/features/support/pages/manager-help-page";

export const Route = createFileRoute("/_app/manager/help")({
  head: () => ({ meta: [{ title: "Help | Linara" }] }),
  component: ManagerHelpPage,
  errorComponent: RouteError,
});
