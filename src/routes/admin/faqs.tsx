import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PlatformAdminFaqsPage } from "@/features/faq/pages/platform-admin-faqs-page";

export const Route = createFileRoute("/admin/faqs")({
  head: () => ({ meta: [{ title: "FAQs — Linara admin" }] }),
  component: PlatformAdminFaqsPage,
  errorComponent: RouteError,
});
