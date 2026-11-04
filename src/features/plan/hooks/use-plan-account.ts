import { useEffect } from "react";

import { useAppStores } from "@/features/dashboard/app-store-context";

import { connectPlan } from "../plan.store";

/**
 * Loads the signed-in manager's plan: the real one where billing is set up
 * in the database, else the sample preview kept per account in this browser.
 */
export function usePlanAccount() {
  const { session } = useAppStores();
  useEffect(() => {
    void connectPlan(session.userId, session.token);
  }, [session.userId, session.token]);
}
