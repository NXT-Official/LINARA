import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PEOPLE_TABS, PeoplePage, type PeopleTab } from "@/features/people/pages/people-page";

type PeopleSearch = {
  /** Which part of People is open. Shareable, so it lives in the URL. */
  tab?: PeopleTab;
};

export const Route = createFileRoute("/_app/manager/people")({
  validateSearch: (search: Record<string, unknown>): PeopleSearch => ({
    tab: PEOPLE_TABS.some((t) => t.key === search.tab) ? (search.tab as PeopleTab) : undefined,
  }),
  head: () => ({ meta: [{ title: "People | Linara" }] }),
  component: ManagerPeopleRoute,
  errorComponent: RouteError,
});

function ManagerPeopleRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <PeoplePage
      tab={tab ?? "staff"}
      onTabChange={(next) =>
        navigate({ search: { tab: next === "staff" ? undefined : next }, replace: true })
      }
    />
  );
}
