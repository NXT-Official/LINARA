import { Outlet, createFileRoute } from "@tanstack/react-router";

import { ManagerShell } from "@/features/dashboard/components/manager-shell";

export const Route = createFileRoute("/_app/manager")({
  component: ManagerLayoutRoute,
});

function ManagerLayoutRoute() {
  return (
    <ManagerShell>
      <Outlet />
    </ManagerShell>
  );
}
