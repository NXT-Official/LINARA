import { createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PeoplePage } from "@/features/people/pages/people-page";

export const Route = createFileRoute("/_app/manager/people")({
  head: () => ({ meta: [{ title: "People | Linara" }] }),
  component: PeoplePage,
  errorComponent: RouteError,
});
