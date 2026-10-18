import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PlatformAdminCostsPage } from "@/features/platform-admin/pages/platform-admin-costs-page";

export const Route = createFileRoute("/admin/costs")({
  head: () => ({ meta: [{ title: "Costs | Linara admin" }] }),
  component: PlatformAdminCostsPage,
  errorComponent: RouteError,
});
