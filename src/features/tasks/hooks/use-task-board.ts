import { useState } from "react";

import { INITIAL_PREP_TASKS } from "@/features/appointments/appointment.constants";
import { helperById } from "@/features/people/people.utils";
import { parseTimeToMinutes, weekdayOf } from "@/lib/time";

import { INITIAL_ROUTINES, INITIAL_TASKS } from "../task.constants";
import type { Routine, Status, Task } from "../task.types";
import { routineMatches } from "../task.utils";

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
};

export type TaskBoard = ReturnType<typeof useTaskBoard>;

/**
 * Today's board: the live task list, the routine templates that respawn it, the
 * simulated date, and the open/closed flag. Appointment prep tasks are owned here
 * too — they are tasks — and `useAppointments` drives them through `syncAppointment`.
 */
export function useTaskBoard({
  nowTs,
  onComplete,
}: {
  nowTs: number;
  onComplete: (record: CompletionRecord) => void;
}) {
  const [tasks, setTasks] = useState<Task[]>([...INITIAL_TASKS, ...INITIAL_PREP_TASKS]);
  const [routines, setRoutines] = useState<Routine[]>(INITIAL_ROUTINES);
  const [boardClosed, setBoardClosed] = useState(false);
  // Simulated "today" — starts on Tuesday, July 7, 2026 to match the seed board.
  const [simDate, setSimDate] = useState<Date>(new Date(2026, 6, 7));

  const addTask = (t: Omit<Task, "id" | "status" | "station">, flags: AddTaskFlags = {}) => {
    const helper = helperById(t.helperId);
    const shouldQueue = boardClosed || flags.queuedForShift;
    setTasks((prev) => [
      ...prev,
      {
        ...t,
        id: `t${Date.now()}`,
        status: "todo",
        station: helper.station,
        queued: shouldQueue || undefined,
        queuedForShift: flags.queuedForShift || undefined,
        afterHours: flags.afterHours,
        emergency: flags.emergency,
        suggested: flags.suggested || undefined,
      },
    ]);
  };

  const updateStatus = (id: string, status: Status, photo?: string) => {
    setTasks((prev) => {
      const cur = prev.find((t) => t.id === id);
      if (!cur) return prev;
      let startedAt = cur.startedAt;
      if (status === "in_progress" && cur.status !== "in_progress" && !startedAt) startedAt = nowTs;
      const updated = {
        ...cur,
        status,
        photo: photo ?? cur.photo,
        blockReason: status === "blocked" ? cur.blockReason : undefined,
        startedAt,
      };
      if (status === "done" && cur.status !== "done") {
        const start = startedAt ?? nowTs - 5 * 60_000;
        onComplete({
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
        });
      }
      return prev.map((t) => (t.id === id ? updated : t));
    });
  };

  const blockTask = (id: string, reason: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "blocked", blockReason: reason } : t)),
    );
  };

  const rescheduleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: "todo", blockReason: undefined, queued: boardClosed ? true : undefined }
          : t,
      ),
    );
  };

  const approveSuggestion = (id: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, suggested: undefined } : t)));

  const dismissSuggestion = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id));

  const setClosed = (closed: boolean) => {
    setBoardClosed(closed);
    if (!closed) {
      // Opening the board — queued tasks graduate to today's To-do
      setTasks((prev) => prev.map((t) => (t.queued ? { ...t, queued: undefined } : t)));
    }
  };

  const addRoutine = (r: Omit<Routine, "id" | "station">) => {
    const helper = helperById(r.helperId);
    setRoutines((prev) => [...prev, { ...r, id: `r${Date.now()}`, station: helper.station }]);
  };

  const removeRoutine = (id: string) => setRoutines((prev) => prev.filter((r) => r.id !== id));

  /** Roll the board to the next day: drop what's finished, respawn matching routines. */
  const startNewDay = () => {
    const next = new Date(simDate);
    next.setDate(next.getDate() + 1);
    const wd = weekdayOf(next);
    setSimDate(next);
    setBoardClosed(false);
    setTasks((prev) => {
      // Keep: unfinished recurring instances (they carry over) and blocked items.
      // Drop: finished (done) tasks and one-off tasks from yesterday.
      const kept = prev
        .filter((t) => {
          if (t.status === "done") return false;
          if (t.appointmentId) return true; // appointment prep tasks persist until done
          if (!t.routineId) return false; // one-offs (including queued one-offs) clear at day-start
          return true;
        })
        .map((t) => ({ ...t, queued: undefined as boolean | undefined }));

      // Spawn a fresh instance for every matching routine that isn't already live.
      const liveRoutineIds = new Set(kept.map((t) => t.routineId).filter(Boolean));
      const spawned: Task[] = routines
        .filter((r) => routineMatches(r, wd) && !liveRoutineIds.has(r.id))
        .map((r) => ({
          id: `t-${r.id}-${next.getTime()}`,
          title: r.title,
          note: r.note,
          time: r.time,
          helperId: r.helperId,
          station: r.station,
          status: "todo",
          recurrence: r.recurrence,
          routineId: r.id,
        }));

      return [...kept, ...spawned].sort(
        (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
      );
    });
  };

  return {
    tasks,
    routines,
    boardClosed,
    simDate,
    addTask,
    updateStatus,
    blockTask,
    rescheduleTask,
    approveSuggestion,
    dismissSuggestion,
    setClosed,
    addRoutine,
    removeRoutine,
    startNewDay,
    /** Escape hatch for `useAppointments`, which creates and reschedules prep tasks. */
    setTasks,
  };
}
