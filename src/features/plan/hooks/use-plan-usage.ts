import { useAppStores } from "@/features/dashboard/app-store-context";

import type { Usage } from "../plan.types";

/**
 * What the plan's limits are measured against, from the app's own data:
 *
 * - households: the ones this account is primary manager of (one, before
 *   add-household-managers.sql lists them);
 * - kasambahay: this household's staff, invited or working, since an invite
 *   takes a place once it's claimed. Across all of a manager's households
 *   needs the billing back end; until then it counts this household;
 * - co-managers: this household's other managers, remote admins included.
 */
export function usePlanUsage(): Usage {
  const { session, invites } = useAppStores();
  const owned = session.households.filter((h) => h.role === "primary_manager").length;
  return {
    households: Math.max(owned, 1),
    kasambahay: invites.invites.filter((i) => i.status !== "ended").length,
    co_managers: session.admins.filter((a) => a.type !== "primary").length,
  };
}
