import { Outlet, createFileRoute } from "@tanstack/react-router";

import { HelperShell } from "@/features/dashboard/components/helper-shell";

export const Route = createFileRoute("/_app/helper")({
  component: HelperLayoutRoute,
});

function HelperLayoutRoute() {
  return (
    <HelperShell>
      <Outlet />
    </HelperShell>
  );
}
