import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { ManagerMoneyPage } from "@/features/dashboard/pages/manager-money-page";

type MoneySearch = {
  /**
   * Whose pay to open on, from a link that's about one helper (Needs You).
   * Without it Money opens on the default helper, which on a multi-helper
   * household is the wrong person (MULTI_HELPER_HANDLING.md).
   */
  helper?: string;
};

export const Route = createFileRoute("/_app/manager/money")({
  validateSearch: (search: Record<string, unknown>): MoneySearch => ({
    helper: typeof search.helper === "string" && search.helper ? search.helper : undefined,
  }),
  head: () => ({ meta: [{ title: "Money | Linara" }] }),
  component: ManagerMoneyRoute,
  errorComponent: RouteError,
});

function ManagerMoneyRoute() {
  const { helper } = Route.useSearch();
  return <ManagerMoneyPage focusHelperId={helper} />;
}
