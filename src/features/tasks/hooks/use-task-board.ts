import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { Helper } from "@/features/people/people.types";
import { findHelper } from "@/features/people/people.utils";
import type { TimeOff } from "@/features/shifts/time-off";
import {
  combineDateAndTime,
  householdNow,
  isoToDisplayTime,
  isoToISODate,
  parseISODate,
  startOfDayIso,
  toHouseholdClock,
  toISODate,
  weekdayOf,
  type Weekday,
} from "@/lib/time";
import { addToQueue } from "@/lib/offline-queue";

import {
  deleteTicketFn,
  getBoardClosedFn,
  insertTicketFn,
  listTicketsFn,
  openQueuedTicketsFn,
  setBoardClosedFn,
  setBoardDateFn,
  updateTicketFn,
  type TicketRow,
} from "../task.actions";
import type { Recurrence, Routine, Status, Task } from "../task.types";
import { movedFromLabel, routineAssignee, routineMatches } from "../task.utils";

export type AddTaskFlags = {
  afterHours?: boolean;
  emergency?: boolean;
  queuedForShift?: boolean;
  suggested?: boolean;
};

/** Reported when a helper finishes work; the ledger decides whether it is owed back. */
export type CompletionRecord = {
  sourceId: string;
  kind: "task" | "utos";
  title: string;
  station?: Task["station"];
  appointmentTitle?: string;
  helperId: string;
  startTs: number;
  doneTs: number;
  autoMinutes: number;
  emergency: boolean;
  afterHours?: boolean;
};

export type TaskBoard = ReturnType<typeof useTaskBoard>;

function encodeRecurrence(r?: Recurrence): string[] | null {
  if (!r || r === "none") return null;
  if (r === "daily") return ["daily"];
  return r;
}

function decodeRecurrence(r: string[] | null): Recurrence | undefined {
  if (r === null || r.length === 0) return undefined;
  if (r.length === 1 && r[0] === "daily") return "daily";
  return r as Weekday[];
}

/** A tickets row as the board shows it. Shared with the planner (use-planner-tasks.ts). */
export function toTask(row: TicketRow, helpers: Helper[]): Task {
  const helper = findHelper(row.helper_id, helpers);
  return {
    id: row.id,
    title: row.title,
    note: row.notes ?? undefined,
    time: isoToDisplayTime(row.scheduled_start),
    scheduledStart: row.scheduled_start,
    helperId: row.helper_id,
    station: helper.station,
    status: row.status,
    photo: row.photo_evidence_url ?? undefined,
    blockReason: row.block_reason ?? undefined,
    queued: row.queued || undefined,
    recurrence: decodeRecurrence(row.recurrence),
    routineId: row.routine_id ?? undefined,
    appointmentId: row.appointment_id ?? undefined,
    appointmentTitle: row.appointment_title ?? undefined,
    // Only appointment-linked tickets carry a real "scheduled for a different
    // day than today" concept -- see supabase/add-ticket-board-columns.sql.
    scheduledDate: row.appointment_id ? isoToISODate(row.scheduled_start) : undefined,
    leadMinutes: row.lead_minutes ?? undefined,
    rescheduleNotice: row.reschedule_notice
      ? {
          // Formatted here, on the viewer's device (C59). Notices from before
          // that fix only hold a string the server formatted in the wrong
          // zone, so they say that the task moved but not from when.
          movedFrom: row.reschedule_notice.oldStartIso
            ? movedFromLabel(row.reschedule_notice.oldStartIso, row.scheduled_start)
            : undefined,
          appointmentTitle: row.reschedule_notice.appointmentTitle,
          movedBy: row.reschedule_notice.movedBy,
        }
      : undefined,
    afterHours: row.is_after_hours || undefined,
    emergency: row.emergency || undefined,
    queuedForShift: row.queued_for_shift || undefined,
    startedAt: row.actual_start ? new Date(row.actual_start).getTime() : undefined,
    finishedAt:
      row.status === "done" && row.actual_end ? new Date(row.actual_end).getTime() : undefined,
    createdBy: row.created_by_profile?.full_name ?? undefined,
    suggested: row.suggested || undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancelledBy: row.cancelled_by_name ?? undefined,
  };
}

/**
 * Today's board: the live task list, the routine templates that respawn it, the
 * simulated date, and the open/closed flag.
 *
 * Real Supabase-backed as of KNOWN_GAPS.md Closed Gap C12 -- every mutator
 * writes through to `tickets` and refetches, same "write then refresh"
 * pattern as useVales/useLedger/useUtos. Cross-tab/device sync now rides
 * Postgres Realtime (see app-store-provider.tsx's household-board-channel),
 * which is why the old broadcast-based `onAction`/`receiveAction` plumbing
 * this hook used to have is gone -- same reasoning as useUtos: keeping both
 * would risk the same edit being applied twice under two different local
 * copies.
 *
 * `routines` stays local-only `useState` -- there is no real table for
 * routine templates yet (see KNOWN_GAPS.md gap #4's closure notes). Only the
 * *spawned* Task instances become real tickets rows, carrying `routineId` as
 * plain provenance (not a FK).
 */
export function useTaskBoard({
  nowTs,
  helpers,
  onComplete,
  isOnline = true,
  token,
  ready,
  activeHelperIds,
  isReachable,
  timeOff = [],
}: {
  nowTs: number;
  /** Real helper_profiles rows (any status), for resolving a task/routine's station
   * from its assigned helperId. */
  helpers: Helper[];
  /** Helpers still employed here. A routine assigned to someone who has left
   * (O4) stops respawning; omitted means every helper counts as active. */
  activeHelperIds?: string[];
  /** Whether a helper may be pinged right now (statusFor != off). A move or
   * hand-over pings only her; the rest see it next time they open the app. */
  isReachable?: (helperId: string) => boolean;
  /** Approved time off: a routine due while its helper is away spawns Unassigned. */
  timeOff?: TimeOff[];
  /** Told about each completion as it happens. The after-hours ledger no longer
   * listens: the database records it for either app (add-ticket-ledger.sql, O25). */
  onComplete?: (record: CompletionRecord) => void;
  isOnline?: boolean;
  token: string | null;
  ready: boolean;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [boardClosed, setBoardClosed] = useState(false);
  // The board's "today" -- starts as real today, but is corrected to the
  // household's persisted board_date once that loads (see the mount effect
  // below); can be pushed forward via startNewDay.
  const [simDate, setSimDate] = useState<Date>(() => householdNow());
  // Set when the real device date has moved past simDate -- either the mount
  // fetch found a stale persisted board_date, or a tab has been left open
  // across a real day boundary (see the nowTs effect below). Consumed by
  // app-store-provider.tsx, which auto-runs the same rollover as a manual
  // "Start new day" once this is non-null (KNOWN_GAPS.md C31).
  const [rolloverNeededFor, setRolloverNeededFor] = useState<Date | null>(null);

  const refresh = useCallback(
    async (dateOverride?: Date) => {
      if (!token) return;
      const sinceIso = startOfDayIso(dateOverride ?? simDate);
      const rows = await listTicketsFn({ data: { token, sinceIso } });
      setTasks(rows.map((row) => toTask(row, helpers)));
    },
    [token, simDate, helpers],
  );

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => {
      console.error("[useTaskBoard] Failed to load the board:", err);
    });
    getBoardClosedFn({ data: { token } })
      .then((res) => {
        setBoardClosed(res.boardClosed);
        // Guarded with a value-equality check: parseISODate always returns a
        // new Date object, and setSimDate's identity feeds refresh's own
        // useCallback deps (which this effect depends on) -- an unguarded
        // update here would re-run this effect every time it resolves.
        // A board_date AHEAD of today was left by the old manual "Start new
        // day", which moved the board to tomorrow (client feedback
        // 2026-10-02: the Pass read Saturday on a Friday). The Pass is today,
        // so come back to it; the rollover effect below still moves it
        // forward at midnight.
        const today = householdNow();
        const ahead = res.boardDate > toISODate(today);
        const persisted = ahead ? today : parseISODate(res.boardDate);
        if (ahead) {
          setBoardDateFn({ data: { token, date: toISODate(today) } }).catch(() => {
            // A remote admin can't write it; a manager's next load will.
          });
        }
        setSimDate((prev) => (toISODate(prev) === toISODate(persisted) ? prev : persisted));
      })
      .catch((err) => {
        console.error("[useTaskBoard] Failed to load board-closed state:", err);
      });
  }, [ready, token, refresh]);

  // Detects a board nobody advanced past a real day boundary: either the
  // fetch above just set simDate from a stale persisted board_date, or a tab
  // has been open long enough for nowTs to tick past an in-memory simDate
  // that was correct when the tab was opened. Idempotent -- startNewDay()
  // clears rolloverNeededFor once it actually runs.
  useEffect(() => {
    if (rolloverNeededFor) return;
    const today = toHouseholdClock(nowTs);
    if (toISODate(today) > toISODate(simDate)) {
      setRolloverNeededFor(today);
    }
  }, [nowTs, simDate, rolloverNeededFor]);

  /** Clears rolloverNeededFor without actually rolling the board over --
   * used by app-store-provider.tsx's server cross-check (KNOWN_GAPS.md O2)
   * when the server's own clock disagrees the day has moved on, meaning the
   * device clock that set the flag was wrong. */
  const dismissRollover = () => setRolloverNeededFor(null);

  const addTask = (t: Omit<Task, "id" | "status" | "station">, flags: AddTaskFlags = {}) => {
    if (!token) {
      toast.error("Hindi ka naka-sign in — hindi ma-add ang task.");
      return;
    }
    // A task can be planned for a later day (the planner, or New task's
    // Date). A closed board only holds back tonight's new tasks, not those.
    const dateIso = t.scheduledDate ?? toISODate(simDate);
    const shouldQueue = (boardClosed && dateIso <= toISODate(simDate)) || !!flags.queuedForShift;
    insertTicketFn({
      data: {
        token,
        title: t.title,
        notes: t.note,
        helperId: t.helperId,
        scheduledStartIso: combineDateAndTime(dateIso, t.time),
        photoEvidenceUrl: t.photo,
        isAfterHours: !!flags.afterHours,
        emergency: !!flags.emergency,
        suggested: !!flags.suggested,
        queued: shouldQueue,
        queuedForShift: !!flags.queuedForShift,
        recurrence: encodeRecurrence(t.recurrence),
        routineId: t.routineId,
      },
    })
      .then(() => refresh())
      .catch((err) => {
        console.error("[useTaskBoard] Failed to add task:", err);
        toast.error("Hindi na-save ang bagong task.");
      });
  };

  const updateStatus = (id: string, status: Status, photo?: string) => {
    if (!isOnline) {
      // Offline mode! Mutate local state immediately and queue the real write
      // for reconnect (see app-store-provider.tsx's syncOfflineQueue).
      setTasks((prev) => {
        const cur = prev.find((t) => t.id === id);
        if (!cur) return prev;
        let startedAt = cur.startedAt;
        if (status === "in_progress" && cur.status !== "in_progress" && !startedAt)
          startedAt = nowTs;
        const updated = {
          ...cur,
          status,
          photo: photo ?? cur.photo,
          blockReason: status === "blocked" ? cur.blockReason : undefined,
          startedAt,
          pendingSync: true,
        };
        // Trigger local ledger record simulation even if offline so that local metrics are computed
        // An unassigned task done by a manager is nobody's after-hours work.
        if (status === "done" && cur.status !== "done" && cur.helperId) {
          const start = startedAt ?? nowTs - 5 * 60_000;
          onComplete?.({
            sourceId: cur.id,
            kind: "task",
            title: cur.title,
            station: cur.station,
            appointmentTitle: cur.appointmentTitle,
            helperId: cur.helperId,
            startTs: start,
            doneTs: nowTs,
            autoMinutes: Math.max(1, Math.round((nowTs - start) / 60_000)),
            emergency: !!cur.emergency,
            afterHours: !!cur.afterHours,
          });
        }
        return prev.map((t) => (t.id === id ? updated : t));
      });
      // Save to IndexedDB offline queue
      addToQueue("update_status", { id, status }, photo)
        .then(() => {
          toast.info("Naka-save offline! Aayusin natin pag may internet na ulit.");
        })
        .catch((err) => {
          console.error("Failed to add to offline queue:", err);
        });
      return;
    }

    if (!token) return;
    const cur = tasks.find((t) => t.id === id);
    if (!cur) return;
    let startedAt = cur.startedAt;
    if (status === "in_progress" && cur.status !== "in_progress" && !startedAt) startedAt = nowTs;
    if (status === "done" && cur.status !== "done" && cur.helperId) {
      const start = startedAt ?? nowTs - 5 * 60_000;
      onComplete?.({
        sourceId: cur.id,
        kind: "task",
        title: cur.title,
        station: cur.station,
        appointmentTitle: cur.appointmentTitle,
        helperId: cur.helperId,
        startTs: start,
        doneTs: nowTs,
        autoMinutes: Math.max(1, Math.round((nowTs - start) / 60_000)),
        emergency: !!cur.emergency,
        afterHours: !!cur.afterHours,
      });
    }

    updateTicketFn({
      data: {
        token,
        ticketId: id,
        patch: {
          status,
          photoEvidenceUrl: photo ?? cur.photo ?? null,
          blockReason: status === "blocked" ? (cur.blockReason ?? null) : null,
          actualStart: startedAt !== undefined ? new Date(startedAt).toISOString() : undefined,
        },
      },
    })
      .then(() => refresh())
      .catch((err) => {
        console.error("[useTaskBoard] Failed to update task status:", err);
        toast.error("Hindi na-save ang status ng task.");
      });
  };

  const blockTask = (id: string, reason: string) => {
    if (!token) return;
    updateTicketFn({
      data: { token, ticketId: id, patch: { status: "blocked", blockReason: reason } },
    })
      .then(() => refresh())
      .catch((err) => {
        console.error("[useTaskBoard] Failed to block task:", err);
        toast.error("Hindi na-save ang block reason.");
      });
  };

  const rescheduleTask = (id: string) => {
    if (!token) return;
    updateTicketFn({
      data: {
        token,
        ticketId: id,
        patch: { status: "todo", blockReason: null, queued: boardClosed },
      },
    })
      .then(() => refresh())
      .catch((err) => {
        console.error("[useTaskBoard] Failed to reschedule task:", err);
        toast.error("Hindi na-reschedule ang task.");
      });
  };

  /** Changes a task's title, note, start and assignee -- the manager's Edit, and
   * the planner's drag to another day. Resolves false when the save failed. */
  const editTask = (
    id: string,
    edit: { title: string; note?: string; scheduledStartIso: string; helperId: string | null },
  ): Promise<boolean> => {
    if (!token) return Promise.resolve(false);
    return updateTicketFn({
      data: {
        token,
        ticketId: id,
        patch: {
          title: edit.title,
          notes: edit.note ?? null,
          scheduledStartIso: edit.scheduledStartIso,
          helperId: edit.helperId,
        },
        notifyHelper: !!edit.helperId && !!isReachable?.(edit.helperId),
      },
    })
      .then(async () => {
        await refresh();
        return true;
      })
      .catch((err) => {
        console.error("[useTaskBoard] Failed to edit task:", err);
        toast.error("Hindi na-save ang pagbabago sa task.");
        return false;
      });
  };

  /**
   * Cancels a task: it stays on the planner and her week, struck through,
   * with who and when (supabase/add-cancelled-tasks.sql), and leaves the
   * board and every to-do count. She hears about it if she's reachable. Undo
   * puts it back to To-do.
   *
   * Until that migration is applied the status doesn't exist and the update
   * is refused by the CHECK constraint, so it falls back to the old delete.
   */
  const cancelTask = (id: string) => {
    if (!token) return;
    const cur = tasks.find((t) => t.id === id);
    updateTicketFn({
      data: {
        token,
        ticketId: id,
        patch: { status: "cancelled" },
        notifyHelper: !!cur?.helperId && !!isReachable?.(cur.helperId),
      },
    })
      .then(() => {
        toast.success("Task cancelled. It stays on the Schedule.", {
          action: { label: "Undo", onClick: () => restoreTask(id) },
        });
        return refresh();
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.message.includes("tickets_status_check")) {
          return deleteTicketFn({ data: { token, ticketId: id } }).then(() => refresh());
        }
        throw err;
      })
      .catch((err) => {
        console.error("[useTaskBoard] Failed to cancel task:", err);
        toast.error("Hindi na-cancel ang task.");
      });
  };

  /** Puts a cancelled task back on the board, as To-do. */
  const restoreTask = (id: string) => {
    if (!token) return;
    updateTicketFn({ data: { token, ticketId: id, patch: { status: "todo", blockReason: null } } })
      .then(() => {
        toast.success("Task restored.");
        return refresh();
      })
      .catch((err) => {
        console.error("[useTaskBoard] Failed to restore task:", err);
        toast.error("Hindi na-restore ang task.");
      });
  };

  const approveSuggestion = (id: string) => {
    if (!token) return;
    updateTicketFn({ data: { token, ticketId: id, patch: { suggested: false } } })
      .then(() => refresh())
      .catch((err) => {
        console.error("[useTaskBoard] Failed to approve suggestion:", err);
        toast.error("Hindi na-approve ang suggestion.");
      });
  };

  const dismissSuggestion = (id: string) => {
    if (!token) return;
    deleteTicketFn({ data: { token, ticketId: id } })
      .then(() => refresh())
      .catch((err) => {
        console.error("[useTaskBoard] Failed to dismiss suggestion:", err);
        toast.error("Hindi na-dismiss ang suggestion.");
      });
  };

  const setClosed = (closed: boolean) => {
    setBoardClosed(closed);
    if (token) {
      setBoardClosedFn({ data: { token, closed } }).catch((err) => {
        console.error("[useTaskBoard] Failed to persist board-closed state:", err);
        toast.error("Hindi na-save ang board status.");
      });
    }
    if (!closed && token) {
      // Opening the board — queued tasks graduate to today's To-do
      openQueuedTicketsFn({ data: { token } })
        .then(() => refresh())
        .catch((err) => {
          console.error("[useTaskBoard] Failed to reopen the board:", err);
          toast.error("Hindi na-open nang maayos ang board.");
        });
    }
  };

  const addRoutine = (r: Omit<Routine, "id" | "station">) => {
    const helper = findHelper(r.helperId, helpers);
    const generatedId = `r${Date.now()}`;
    const newRoutine: Routine = { ...r, id: generatedId, station: helper.station };
    setRoutines((prev) => [...prev, newRoutine]);
  };

  const removeRoutine = (id: string) => {
    setRoutines((prev) => prev.filter((r) => r.id !== id));
  };

  /** Which of today's local routines haven't already spawned a live ticket
   * for `targetDate`'s weekday -- the pure half of startNewDay(). */
  const routinesToSpawn = (targetDate: Date): Routine[] => {
    const wd = weekdayOf(targetDate);
    const liveRoutineIds = new Set(tasks.map((t) => t.routineId).filter(Boolean));
    const employed = activeHelperIds ? new Set(activeHelperIds) : null;
    return routines.filter(
      (r) =>
        routineMatches(r, wd) &&
        !liveRoutineIds.has(r.id) &&
        (!employed || employed.has(r.helperId)),
    );
  };

  /** Roll the board to `targetDate`: respawn matching routines and persist
   * the new board_date (KNOWN_GAPS.md C31) alongside the existing
   * board_closed reopen. Dropping finished/expired tasks off the visible
   * board is handled by refresh()'s query itself (see listTicketsFn), not by
   * discarding local state. Used both for the manual "Start new day" click
   * (targetDate = simDate + 1 day) and for silently catching up a board left
   * behind a real day boundary (targetDate = today) -- see
   * app-store-provider.tsx. */
  const startNewDay = async (targetDate: Date): Promise<{ routinesRespawned: number }> => {
    setSimDate(targetDate);
    setBoardClosed(false);
    setRolloverNeededFor(null);

    if (!token) return { routinesRespawned: 0 };

    setBoardClosedFn({ data: { token, closed: false } }).catch((err) => {
      console.error("[useTaskBoard] Failed to persist board reopen on new day:", err);
    });
    setBoardDateFn({ data: { token, date: toISODate(targetDate) } }).catch((err) => {
      console.error("[useTaskBoard] Failed to persist the new board date:", err);
    });

    const toSpawn = routinesToSpawn(targetDate);

    try {
      await Promise.all(
        toSpawn.map((r) =>
          insertTicketFn({
            data: {
              token,
              title: r.title,
              notes: r.note,
              helperId: routineAssignee(r, toISODate(targetDate), timeOff),
              scheduledStartIso: combineDateAndTime(toISODate(targetDate), r.time),
              recurrence: encodeRecurrence(r.recurrence),
              routineId: r.id,
            },
          }),
        ),
      );
      await refresh(targetDate);
    } catch (err) {
      console.error("[useTaskBoard] Failed to roll over to the next day:", err);
      toast.error("Hindi na-simulan ang bagong araw nang maayos.");
    }
    return { routinesRespawned: toSpawn.length };
  };

  return {
    tasks,
    routines,
    boardClosed,
    simDate,
    rolloverNeededFor,
    dismissRollover,
    addTask,
    updateStatus,
    blockTask,
    rescheduleTask,
    editTask,
    cancelTask,
    restoreTask,
    approveSuggestion,
    dismissSuggestion,
    setClosed,
    addRoutine,
    removeRoutine,
    startNewDay,
    refresh,
  };
}
