import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/features/dashboard/components/app-shell";
import { AppStoreProvider } from "@/features/dashboard/components/app-store-provider";

export const Route = createFileRoute("/_app")({
  component: AppLayoutRoute,
});

/** Every page runs inside one set of feature stores and one header. */
function AppLayoutRoute() {
  return (
    <AppStoreProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </AppStoreProvider>
  );
}
