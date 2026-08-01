import { createFileRoute } from "@tanstack/react-router";

import { PeoplePage } from "@/features/people/pages/people-page";

export const Route = createFileRoute("/_app/manager/people")({
  component: PeoplePage,
});
