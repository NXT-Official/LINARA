import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { Helper } from "@/features/people/people.types";
import { findHelper } from "@/features/people/people.utils";
import type { PlaceRef } from "@/features/sharing/sharing.types";
import { placeFromColumns } from "@/features/sharing/sharing.utils";
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
} from "@/lib/time";
import { addToQueue } from "@/lib/offline-queue";

import {
  deleteTicketFn,
  getBoardClosedFn,
  insertRoutineTasksFn,
  insertTicketFn,
  listRepeatingTicketsFn,
  listTicketsFn,
  openQueuedTicketsFn,
  setBoardClosedFn,
  setBoardDateFn,
  spawnRoutineTasksFn,
  stopRepeatFn,
  updateTicketFn,
  type TicketRow,
} from "../task.actions";
import { firstRoutineDay, routinesDueOn, routinesFromTickets } from "../routine.utils";
import type { Routine, Status, Task } from "../task.types";
import { decodeRecurrence, encodeRecurrence, movedFromLabel } from "../task.utils";

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

/** How far back the Routines list reads a series' tasks. Each one still going has one at least weekly. */
const ROUTINE_LOOKBACK_DAYS = 35;

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
    photoThumb: row.photo_thumb_url ?? undefined,
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
    durationMinutes: row.duration_minutes ?? undefined,
    from: placeFromColumns(row.from_household_id, row.from_place_id),
    to: placeFromColumns(row.to_household_id, row.to_place_id),
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
 * `routines` are the household's repeating tasks, read off the tickets
 * themselves (KNOWN_GAPS.md O43): a series of tickets sharing a routine_id,
 * the newest of which is the pattern for the next day's (routine.utils.ts).
 * Each day's task is made by the database (spawn_routine_tasks, from
 * supabase/add-repeating-tasks.sql) whenever the board opens and at the
 * midnight rollover, and by an hourly job; until that SQL is applied, this
 * hook makes them itself.
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
  staffReady = true,
}: {
  nowTs: number;
  /** Real helper_profiles rows (any status), for resolving a task/routine's station
   * from its assigned helperId. */
  helpers: Helper[];
  /** Helpers still working here. A routine of someone who has left (O4)
   * spawns Unassigned (O43); omitted means every helper counts as active. */
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
  /** The roster and time off have loaded. Only the web's own spawn (before
   * add-repeating-tasks.sql) waits for it, so nobody's task goes to the wrong
   * person because they weren't known yet. */
  staffReady?: boolean;
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

  /** The household's repeating tasks, fresh. */
  const loadRoutines = useCallback(async (): Promise<Routine[]> => {
    if (!token) return [];
    const since = householdNow();
    since.setDate(since.getDate() - ROUTINE_LOOKBACK_DAYS);
    const rows = await listRepeatingTicketsFn({ data: { token, sinceIso: startOfDayIso(since) } });
    const list = routinesFromTickets(rows, helpers);
    setRoutines(list);
    return list;
  }, [token, helpers]);

  const refresh = useCallback(
    async (dateOverride?: Date) => {
      if (!token) return;
      const sinceIso = startOfDayIso(dateOverride ?? simDate);
      const [rows] = await Promise.all([
        listTicketsFn({ data: { token, sinceIso } }),
        loadRoutines().catch((err) => {
          console.error("[useTaskBoard] Failed to load routines:", err);
        }),
      ]);
      setTasks(rows.map((row) => toTask(row, helpers)));
    },
    [token, simDate, helpers, loadRoutines],
  );

  // Read at call time, so a spawn started before they load uses the latest.
  const staffRef = useRef({ activeHelperIds, timeOff, staffReady });
  staffRef.current = { activeHelperIds, timeOff, staffReady };

  // One spawn per household day in flight, shared by the page load, the
  // midnight rollover and any second call, so they report the same count.
  const spawning = useRef(new Map<string, Promise<number>>());

  /**
   * Makes the household's repeating tasks due on `dayIso` (today), once:
   * spawn_routine_tasks in the database, or, before add-repeating-tasks.sql is
   * applied, the same thing from here, with an id per series and day so a
   * second tab can't double one. Resolves to how many were made. Making them
   * from here waits for the roster and time off (staffReady), so it's skipped
   * until then and the next call tries again.
   */
  const ensureRoutineTasks = useCallback(
    (dayIso: string): Promise<number> => {
      if (!token) return Promise.resolve(0);
      const running = spawning.current.get(dayIso);
      if (running) return running;
      const run = (async () => {
        const res = await spawnRoutineTasksFn({ data: { token } });
        if (res) return res.spawned;
        const { activeHelperIds: active, timeOff: off, staffReady: known } = staffRef.current;
        if (!known) {
          spawning.current.delete(dayIso);
          return 0;
        }
        const due = routinesDueOn(
          await loadRoutines(),
          dayIso,
          off,
          active ?? helpers.map((h) => h.id),
        );
        if (due.length === 0) return 0;
        const made = await insertRoutineTasksFn({
          data: {
            token,
            tasks: due.map(({ routine: r, helperId }) => ({
              series: r.id,
              dayIso,
              title: r.title,
              notes: r.note,
              helperId,
              scheduledStartIso: combineDateAndTime(dayIso, r.time),
              recurrence: encodeRecurrence(r.recurrence) ?? ["daily"],
              durationMinutes: r.durationMinutes,
              from: r.from,
              to: r.to,
            })),
          },
        });
        return made.spawned;
      })().catch((err) => {
        console.error("[useTaskBoard] Failed to make today's repeating tasks:", err);
        // Let a later load try again.
        spawning.current.delete(dayIso);
        return 0;
      });
      spawning.current.set(dayIso, run);
      return run;
    },
    [token, loadRoutines, helpers],
  );

  // Today's repeating tasks exist whenever the board is open: on load, and
  // again once the household's day turns over with the tab left open.
  const todayIso = toISODate(toHouseholdClock(nowTs));
  useEffect(() => {
    if (!ready || !token) return;
    void ensureRoutineTasks(todayIso).then((made) => {
      if (made > 0) return refresh();
    });
    // refresh is left out on purpose: it changes with every helper and date
    // update, and this only needs to run once per day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, staffReady, todayIso, ensureRoutineTasks]);

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
        from: t.from,
        to: t.to,
        durationMinutes: t.durationMinutes,
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
    edit: {
      title: string;
      note?: string;
      scheduledStartIso: string;
      helperId: string | null;
      /** A trip's ends; null clears one, absent leaves it. */
      from?: PlaceRef | null;
      to?: PlaceRef | null;
      /** How long; null clears it, absent leaves it. */
      durationMinutes?: number | null;
    },
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
          from: edit.from,
          to: edit.to,
          durationMinutes: edit.durationMinutes,
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

  /**
   * A new routine (Schedule -> Routines): its first task, which starts the
   * series, on the first day it repeats whose time is still ahead. The days
   * after are made from it.
   */
  const addRoutine = (r: Omit<Routine, "id" | "station">) => {
    if (!token) {
      toast.error("Sign in to add a routine.");
      return;
    }
    const now = householdNow();
    const dayIso = firstRoutineDay(
      r.recurrence,
      toISODate(now),
      now.getHours() * 60 + now.getMinutes(),
      r.time,
    );
    insertTicketFn({
      data: {
        token,
        title: r.title,
        notes: r.note,
        helperId: r.helperId,
        scheduledStartIso: combineDateAndTime(dayIso, r.time),
        recurrence: encodeRecurrence(r.recurrence),
        queued: boardClosed && dayIso <= toISODate(simDate),
        durationMinutes: r.durationMinutes,
        from: r.from,
        to: r.to,
      },
    })
      .then(() => {
        const first = parseISODate(dayIso).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        });
        toast.success(`Routine saved. The first one is ${first}.`);
        return refresh();
      })
      .catch((err) => {
        console.error("[useTaskBoard] Failed to add routine:", err);
        toast.error("The routine wasn't saved.");
      });
  };

  /**
   * Stops a repeating task, by its series (a Routine's id, or a task's
   * routineId): nothing more is made after the tasks already there, which
   * stay as they are. Resolves false when it didn't stop.
   */
  const stopRepeating = (routineId: string): Promise<boolean> => {
    if (!token) return Promise.resolve(false);
    return stopRepeatFn({ data: { token, routineId } })
      .then(async (changed) => {
        if (changed === 0) throw new Error("No task of this routine could be changed.");
        toast.success("It won't repeat any more. Tasks already planned stay.");
        await refresh();
        return true;
      })
      .catch((err) => {
        console.error("[useTaskBoard] Failed to stop the repeat:", err);
        toast.error("It's still repeating. Try again.");
        return false;
      });
  };

  const removeRoutine = (id: string) => {
    void stopRepeating(id);
  };

  /** Roll the board to `targetDate`: make its repeating tasks and persist
   * the new board_date (KNOWN_GAPS.md C31) alongside the existing
   * board_closed reopen. Dropping finished/expired tasks off the visible
   * board is handled by refresh()'s query itself (see listTicketsFn), not by
   * discarding local state. Used for silently catching up a board left
   * behind a real day boundary (targetDate = today) -- see
   * app-store-provider.tsx. The repeating tasks are always the household's
   * real today's, whatever targetDate says: the database decides the day. */
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

    const made = await ensureRoutineTasks(toISODate(targetDate));
    try {
      await refresh(targetDate);
    } catch (err) {
      console.error("[useTaskBoard] Failed to roll over to the next day:", err);
      toast.error("Hindi na-simulan ang bagong araw nang maayos.");
    }
    return { routinesRespawned: made };
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
    stopRepeating,
    startNewDay,
    refresh,
  };
}
