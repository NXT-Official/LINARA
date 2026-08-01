import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import type { PassMode } from "@/features/dashboard/components/manager-pass-tab";
import { ManagerPassPage } from "@/features/dashboard/pages/manager-pass-page";

type PassSearch = {
  /** Which layout the Pass is showing. Shareable, so it lives in the URL. */
  view?: PassMode;
};

export const Route = createFileRoute("/_app/manager/pass")({
  validateSearch: (search: Record<string, unknown>): PassSearch => ({
    view: search.view === "line" || search.view === "board" ? search.view : undefined,
  }),
  head: () => ({ meta: [{ title: "The Pass | Linara" }] }),
  component: ManagerPassRoute,
  errorComponent: RouteError,
});

function ManagerPassRoute() {
  const { view } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <ManagerPassPage
      view={view}
      onViewChange={(mode) => navigate({ search: { view: mode }, replace: true })}
    />
  );
}
