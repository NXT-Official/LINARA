import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PlatformAdminHouseholdsPage } from "@/features/platform-admin/pages/platform-admin-households-page";

export const Route = createFileRoute("/admin/households")({
  head: () => ({ meta: [{ title: "Households — Linara admin" }] }),
  component: PlatformAdminHouseholdsPage,
  errorComponent: RouteError,
});
