import { createFileRoute } from "@tanstack/react-router";

import { ManagerPassPage } from "@/features/dashboard/pages/manager-pass-page";

export const Route = createFileRoute("/_app/manager/pass")({
  component: ManagerPassPage,
});
