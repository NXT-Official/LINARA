import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  cancelLeaveFn,
  decideLeaveFn,
  listLeaveFn,
  recordLeaveFn,
} from "@/features/leave/leave.actions";
import type { LeaveKind, LeaveReason, LeaveRequest } from "@/features/leave/leave.types";
import { leaveRangeIso } from "@/features/leave/leave.utils";
import { listRestOffRequestsFn, type RestOffRequestRow } from "@/features/ledger/rest-off.actions";
import { unassignOpenTasksBetweenFn } from "@/features/tasks/task.actions";

import { timeOffFromLeave, timeOffFromRestOff, type TimeOff } from "../time-off";

export type RecordLeaveInput = {
  helperId: string;
  kind: LeaveKind;
  reason: LeaveReason;
  startDate: string;
  endDate: string;
  note?: string;
  /** Also move her unfinished tasks on those days to Unassigned. */
  unassignTasks?: boolean;
};

export type TimeOffStore = {
  /** Every helper's approved and pending time off: rest off and leave, a day per entry. */
  list: TimeOff[];
  /** Every leave request in the household, any status, newest first. */
  leave: LeaveRequest[];
  /** Refetch now, e.g. after a manager decides a rest-off request. */
  reload: () => void;
  /** Each resolves true once saved; a refusal is shown as a toast with the server's reason. */
  decideLeave: (
    id: string,
    decision: "approved" | "declined",
    opts?: { unassignTasks?: boolean },
  ) => Promise<boolean>;
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
    async (
      write: () => Promise<unknown>,
      done: string,
      failed: string,
      after?: () => Promise<void>,
    ) => {
      try {
        await write();
      } catch (err) {
        // The database's own reasons ("Not enough service incentive leave: ...")
        // say what to do, so they're shown as they are.
        toast.error(err instanceof Error ? err.message : failed);
        reload();
        return false;
      }
      toast.success(done);
      // A follow-up reports its own failure: what `write` saved stays saved.
      await after?.();
      reload();
      return true;
    },
    [reload],
  );

  /**
   * Once leave is approved, her unfinished tasks on those days go to
   * Unassigned (LEAVE_PLAN.md step 4). The leave itself is already saved, so
   * a failure here says so rather than calling the whole thing failed.
   */
  const unassignDuring = useCallback(
    async (helperId: string, startDate: string, endDate: string) => {
      if (!token) return;
      try {
        const moved = await unassignOpenTasksBetweenFn({
          data: { token, helperId, ...leaveRangeIso(startDate, endDate) },
        });
        if (moved > 0)
          toast.success(`${moved} ${moved === 1 ? "task" : "tasks"} moved to Unassigned.`);
      } catch (err) {
        console.error("[useTimeOff] Failed to move tasks off leave days:", err);
        toast.error(
          "Leave saved, but the tasks on those days couldn't be moved. Move them on Schedule.",
        );
      }
    },
    [token],
  );

  const decideLeave = useCallback(
    (id: string, decision: "approved" | "declined", opts?: { unassignTasks?: boolean }) => {
      if (!token) return Promise.resolve(false);
      const request = leave.find((l) => l.id === id);
      return run(
        () => decideLeaveFn({ data: { token, requestId: id, decision } }),
        decision === "approved" ? "Leave approved." : "Leave declined.",
        "Couldn't save that decision.",
        decision === "approved" && opts?.unassignTasks && request
          ? () => unassignDuring(request.helperId, request.startDate, request.endDate)
          : undefined,
      );
    },
    [token, run, leave, unassignDuring],
  );

  const recordLeave = useCallback(
    ({ unassignTasks, ...input }: RecordLeaveInput) =>
      token
        ? run(
            () => recordLeaveFn({ data: { token, ...input } }),
            "Leave recorded. She'll be asked to confirm it.",
            "Couldn't record that leave.",
            unassignTasks
              ? () => unassignDuring(input.helperId, input.startDate, input.endDate)
              : undefined,
          )
        : Promise.resolve(false),
    [token, run, unassignDuring],
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
