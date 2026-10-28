import { useEffect } from "react";

import { useAppStores } from "@/features/dashboard/app-store-context";

import { loadPlanFor } from "../plan.store";

/** Keeps the sample plan on the signed-in manager's own, across reloads and household switches. */
export function usePlanAccount() {
  const { session } = useAppStores();
  useEffect(() => {
    loadPlanFor(session.userId);
  }, [session.userId]);
}
