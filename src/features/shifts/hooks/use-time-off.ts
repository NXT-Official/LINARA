import { useCallback, useEffect, useState } from "react";

import { listRestOffRequestsFn } from "@/features/ledger/rest-off.actions";

import { timeOffFromRestOff, type TimeOff } from "../time-off";

export type TimeOffStore = {
  /** Every helper's approved and pending time off. */
  list: TimeOff[];
  /** Refetch now, e.g. after a manager decides a request. */
  reload: () => void;
};

// A helper asks for rest off from her own phone, so this can't only follow
// this tab's writes. Rest off is planned ahead, so a few minutes' lag is fine.
const POLL_MS = 5 * 60_000;

/** The household's time off, for the planner, availability and the send gate (KNOWN_GAPS O19). */
export function useTimeOff({
  token,
  ready,
}: {
  token: string | null;
  ready: boolean;
}): TimeOffStore {
  const [list, setList] = useState<TimeOff[]>([]);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    const load = () =>
      listRestOffRequestsFn({ data: { token } })
        .then((rows) => {
          if (!cancelled) setList(timeOffFromRestOff(rows));
        })
        .catch((err) => {
          console.error("[useTimeOff] Failed to load time off:", err);
        });
    void load();
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ready, token, reloads]);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  return { list, reload };
}
