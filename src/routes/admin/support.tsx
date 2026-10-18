import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PlatformAdminSupportPage } from "@/features/support/pages/platform-admin-support-page";

export const Route = createFileRoute("/admin/support")({
  head: () => ({ meta: [{ title: "Support — Linara admin" }] }),
  component: PlatformAdminSupportPage,
  errorComponent: RouteError,
});
