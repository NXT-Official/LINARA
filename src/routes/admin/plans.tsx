import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PlatformAdminPlansPage } from "@/features/billing/pages/platform-admin-plans-page";

export const Route = createFileRoute("/admin/plans")({
  head: () => ({ meta: [{ title: "Plans | Linara admin" }] }),
  component: PlatformAdminPlansPage,
  errorComponent: RouteError,
});
