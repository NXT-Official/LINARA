import { useCallback, useEffect, useMemo, useState } from "react";

import { listPayPeriodsForFn } from "../pay.actions";
import type { PayPeriod } from "../pay.types";

export type PayPeriodStore = ReturnType<typeof usePayPeriods>;

/**
 * Every helper's pay periods (supabase/add-pay-periods.sql's
 * helper_pay_periods), for current and past staff alike. The one list the Pay
 * Dial, the Money page, Past staff and Needs You read, so "which periods are
 * unpaid" has a single answer. Refetched whenever the payslips change, since
 * every payment settles a period.
 */
export function usePayPeriods({
  token,
  ready,
  helperIds,
  payslipsVersion,
}: {
  token: string | null;
  ready: boolean;
  /** Claimed helpers, current or past; unclaimed invites have no periods. */
  helperIds: string[];
  /** Anything that changes when a payslip is written (their ids, joined). */
  payslipsVersion: string;
}) {
  const [byHelper, setByHelper] = useState<Record<string, PayPeriod[]>>({});
  const idKey = useMemo(() => [...helperIds].sort().join(","), [helperIds]);

  const refresh = useCallback(async () => {
    if (!token || !idKey) {
      setByHelper({});
      return;
    }
    // One request for everyone, however many staff (KNOWN_GAPS.md O36).
    try {
      setByHelper(await listPayPeriodsForFn({ data: { token, helperIds: idKey.split(",") } }));
    } catch (err) {
      console.error("[usePayPeriods] Periods failed:", err);
      setByHelper({});
    }
  }, [token, idKey]);

  useEffect(() => {
    if (!ready) return;
    void refresh();
  }, [ready, refresh, payslipsVersion]);

  /** Closed periods nobody has paid, current and final ones excluded. */
  const missed = useCallback(
    (helperId: string) =>
      (byHelper[helperId] ?? []).filter((p) => !p.payslipId && !p.isCurrent && !p.isFinal),
    [byHelper],
  );

  return { byHelper, refresh, missed };
}
