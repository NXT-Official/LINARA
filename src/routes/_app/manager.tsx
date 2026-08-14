import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

import { useAppStores } from "@/features/dashboard/app-store-context";
import { ManagerShell } from "@/features/dashboard/components/manager-shell";

export const Route = createFileRoute("/_app/manager")({
  component: ManagerLayoutRoute,
});

function ManagerLayoutRoute() {
  return (
    <ManagerShell>
      <RequireManagerAuth>
        <Outlet />
      </RequireManagerAuth>
    </ManagerShell>
  );
}

/**
 * Client-side gate: the manager session lives in localStorage, which the
 * server can't see at SSR time, so this can't be a `beforeLoad` check
 * without a redirect-then-un-redirect flash on every navigation. Both
 * server and client render the loading state on first paint (no
 * hydration mismatch); the tradeoff is a brief flash on every manager
 * page load until the session resolves client-side.
 */
function RequireManagerAuth({ children }: { children: React.ReactNode }) {
  const { session } = useAppStores();
  const navigate = useNavigate();

  useEffect(() => {
    if (session.status === "anon") {
      navigate({ to: "/login" });
    } else if (session.status === "needs_bootstrap") {
      navigate({ to: "/login" });
    }
  }, [session.status, navigate]);

  if (session.status !== "authed") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
