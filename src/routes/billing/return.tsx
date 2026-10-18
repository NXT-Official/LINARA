import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { BillingReturnPage } from "@/features/billing/pages/billing-return-page";

type ReturnSearch = {
  paid?: "1" | "0";
};

/** Public: the Linara app opens Xendit in the system browser, where there is no web session. */
export const Route = createFileRoute("/billing/return")({
  validateSearch: (search: Record<string, unknown>): ReturnSearch => ({
    paid: search.paid === "1" || search.paid === "0" ? search.paid : undefined,
  }),
  head: () => ({ meta: [{ title: "Payment | Linara" }, { name: "robots", content: "noindex" }] }),
  component: BillingReturnRoute,
  errorComponent: RouteError,
});

function BillingReturnRoute() {
  const { paid } = Route.useSearch();
  return <BillingReturnPage paid={paid} />;
}
