import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  cancelLeaveFn,
  decideLeaveFn,
  listLeaveFn,
  recordLeaveFn,
} from "@/features/leave/leave.actions";
import type { LeaveKind, LeaveReason, LeaveRequest } from "@/features/leave/leave.types";
import { listRestOffRequestsFn, type RestOffRequestRow } from "@/features/ledger/rest-off.actions";

import { timeOffFromLeave, timeOffFromRestOff, type TimeOff } from "../time-off";

export type RecordLeaveInput = {
  helperId: string;
  kind: LeaveKind;
  reason: LeaveReason;
  startDate: string;
  endDate: string;
  note?: string;
};

export type TimeOffStore = {
  /** Every helper's approved and pending time off: rest off and leave, a day per entry. */
  list: TimeOff[];
  /** Every leave request in the household, any status, newest first. */
  leave: LeaveRequest[];
  /** Refetch now, e.g. after a manager decides a rest-off request. */
  reload: () => void;
  /** Each resolves true once saved; a refusal is shown as a toast with the server's reason. */
  decideLeave: (id: string, decision: "approved" | "declined") => Promise<boolean>;
  recordLeave: (input: RecordLeaveInput) => Promise<boolean>;
  cancelLeave: (id: string) => Promise<boolean>;
};

// A helper asks from her own phone, so this can't only follow this tab's
// writes. Time off is planned ahead, so a few minutes' lag is fine.
const POLL_MS = 5 * 60_000;

/** The household's time off, for the planner, availability, the gate, Needs you and People (KNOWN_GAPS C70). */
export function useTimeOff({
  token,
  ready,
}: {
  token: string | null;
  ready: boolean;
}): TimeOffStore {
  const [restOff, setRestOff] = useState<RestOffRequestRow[]>([]);
  const [leave, setLeave] = useState<LeaveRequest[]>([]);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    const load = () =>
      Promise.all([listRestOffRequestsFn({ data: { token } }), listLeaveFn({ data: { token } })])
        .then(([restRows, leaveRows]) => {
          if (cancelled) return;
          setRestOff(restRows);
          setLeave(leaveRows);
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

  const list = useMemo(
    () => [...timeOffFromRestOff(restOff), ...timeOffFromLeave(leave)],
    [restOff, leave],
  );

  const run = useCallback(
    async (write: () => Promise<unknown>, done: string, failed: string) => {
      try {
        await write();
        toast.success(done);
        return true;
      } catch (err) {
        // The database's own reasons ("Not enough service incentive leave: ...")
        // say what to do, so they're shown as they are.
        toast.error(err instanceof Error ? err.message : failed);
        return false;
      } finally {
        reload();
      }
    },
    [reload],
  );

  const decideLeave = useCallback(
    (id: string, decision: "approved" | "declined") =>
      token
        ? run(
            () => decideLeaveFn({ data: { token, requestId: id, decision } }),
            decision === "approved" ? "Leave approved." : "Leave declined.",
            "Couldn't save that decision.",
          )
        : Promise.resolve(false),
    [token, run],
  );

  const recordLeave = useCallback(
    (input: RecordLeaveInput) =>
      token
        ? run(
            () => recordLeaveFn({ data: { token, ...input } }),
            "Leave recorded. She'll be asked to confirm it.",
            "Couldn't record that leave.",
          )
        : Promise.resolve(false),
    [token, run],
  );

  const cancelLeave = useCallback(
    (id: string) =>
      token
        ? run(
            () => cancelLeaveFn({ data: { token, requestId: id } }),
            "Leave cancelled.",
            "Couldn't cancel that leave.",
          )
        : Promise.resolve(false),
    [token, run],
  );

  return { list, leave, reload, decideLeave, recordLeave, cancelLeave };
}
