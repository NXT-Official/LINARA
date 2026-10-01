import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import {
  ManagerSchedulePage,
  SCHEDULE_TABS,
  type ScheduleTab,
} from "@/features/dashboard/pages/manager-schedule-page";

type ScheduleSearch = {
  /** Which part of Schedule is open. Shareable, so it lives in the URL. */
  tab?: ScheduleTab;
  /** YYYY-MM-DD the planner opens on (from the Pass's "Coming up"). */
  day?: string;
};

export const Route = createFileRoute("/_app/manager/schedule")({
  validateSearch: (search: Record<string, unknown>): ScheduleSearch => ({
    tab: SCHEDULE_TABS.some((t) => t.key === search.tab) ? (search.tab as ScheduleTab) : undefined,
    day:
      typeof search.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.day)
        ? search.day
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Schedule | Linara" }] }),
  component: ManagerScheduleRoute,
  errorComponent: RouteError,
});

function ManagerScheduleRoute() {
  const { tab, day } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <ManagerSchedulePage
      tab={tab ?? "plan"}
      day={day}
      onTabChange={(next) =>
        navigate({ search: { tab: next === "plan" ? undefined : next }, replace: true })
      }
    />
  );
}
