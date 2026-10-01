import { useCallback, useEffect, useMemo, useState } from "react";

import type { Helper } from "@/features/people/people.types";

import { listTicketsBetweenFn, type TicketRow } from "../task.actions";
import type { Task } from "../task.types";
import { toTask } from "./use-task-board";

/**
 * Every task scheduled in [fromIso, toIso), for the planner's week or month.
 *
 * Writes still go through the board (useTaskBoard), so this refetches
 * whenever `boardTasks` changes: after any save, and whenever Realtime brings
 * in someone else's change. `moveLocally` shows a drag's result before the
 * save lands.
 */
export function usePlannerTasks({
  token,
  fromIso,
  toIso,
  helpers,
  boardTasks,
}: {
  token: string | null;
  fromIso: string;
  toIso: string;
  helpers: Helper[];
  boardTasks: Task[];
}) {
  const [rows, setRows] = useState<{ key: string; rows: TicketRow[] } | null>(null);
  const [reloads, setReloads] = useState(0);
  const key = `${fromIso}|${toIso}`;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    listTicketsBetweenFn({ data: { token, fromIso, toIso } })
      .then((fetched) => {
        if (!cancelled) setRows({ key: `${fromIso}|${toIso}`, rows: fetched });
      })
      .catch((err) => {
        console.error("[usePlannerTasks] Failed to load the plan:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [token, fromIso, toIso, boardTasks, reloads]);

  // Rows from a range the planner has since left aren't shown as this one's.
  const current = rows?.key === key ? rows.rows : null;
  const tasks = useMemo(
    () => (current ? current.map((row) => toTask(row, helpers)) : null),
    [current, helpers],
  );

  const moveLocally = useCallback((id: string, scheduledStartIso: string) => {
    setRows((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) =>
              r.id === id ? { ...r, scheduled_start: scheduledStartIso } : r,
            ),
          }
        : prev,
    );
  }, []);

  const reload = useCallback(() => setReloads((n) => n + 1), []);

  return { tasks, moveLocally, reload };
}
