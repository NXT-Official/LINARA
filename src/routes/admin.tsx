import { Outlet, createFileRoute } from "@tanstack/react-router";

import { RouteError } from "@/components/shared/route-error";
import { PlatformAdminShell } from "@/features/platform-admin/components/platform-admin-shell";
import { RequirePlatformAdmin } from "@/features/platform-admin/components/require-platform-admin";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Linara admin" }] }),
  component: AdminLayoutRoute,
  errorComponent: RouteError,
});

// The gate wraps the shell so the nav never shows to someone who isn't staff.
function AdminLayoutRoute() {
  return (
    <RequirePlatformAdmin>
      <PlatformAdminShell>
        <Outlet />
      </PlatformAdminShell>
    </RequirePlatformAdmin>
  );
}
