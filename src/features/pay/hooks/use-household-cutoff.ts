import { useEffect, useState } from "react";

import type { PaydayInterval } from "@/features/people/people.types";

import { getHouseholdCutoffFn, type HouseholdCutoff } from "../pay.actions";

/**
 * The current cutoff for one helper's payday interval, derived in Postgres --
 * `public.household_cutoff()`, see
 * supabase/add-household-timezone-and-cutoffs.sql. Session B deleted the
 * client-side `currentCutoffRange`; see pay.utils.ts for what it got wrong.
 *
 * Deliberately keyed on a *specific* helper's `paydayInterval` rather than
 * living in the app-store provider next to `usePayslips`: `payday_interval` is
 * a per-helper column, and the Money tab has a helper switcher. A single
 * provider-level cutoff would silently be the default helper's, so a household
 * mixing semi-monthly and monthly helpers would compare a payslip against the
 * wrong cutoff -- the "which helper is this action about?" failure mode
 * MULTI_HELPER_HANDLING.md tracks for exactly this surface.
 *
 * Returns `null` until it resolves. Callers must treat that as "unknown", not
 * as "no payout yet" -- rendering a Pay button on an unknown cutoff is the bug
 * this replaced.
 */
export function useHouseholdCutoff({
  token,
  ready,
  paydayInterval,
}: {
  token: string | null;
  ready: boolean;
  paydayInterval: PaydayInterval | null | undefined;
}): HouseholdCutoff | null {
  const [cutoff, setCutoff] = useState<HouseholdCutoff | null>(null);

  useEffect(() => {
    if (!ready || !token || !paydayInterval) {
      setCutoff(null);
      return;
    }

    let cancelled = false;
    getHouseholdCutoffFn({ data: { token, paydayInterval } })
      .then((res) => {
        if (!cancelled) setCutoff(res);
      })
      .catch((err) => {
        if (!cancelled) setCutoff(null);
        console.error("[useHouseholdCutoff] Failed to load the current cutoff:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, token, paydayInterval]);

  return cutoff;
}
