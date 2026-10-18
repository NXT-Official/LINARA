import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PlatformAdminOverviewPage } from "@/features/platform-admin/pages/platform-admin-overview-page";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Overview | Linara admin" }] }),
  component: PlatformAdminOverviewPage,
  errorComponent: RouteError,
});
