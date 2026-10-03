import { useEffect, useMemo, useState } from "react";

import type { Helper } from "@/features/people/people.types";

import { searchTicketsFn, type TicketRow } from "../task.actions";
import type { Status, Task } from "../task.types";
import { toTask } from "./use-task-board";

/** Fewer letters than this match too much to be worth a search. */
export const MIN_SEARCH_LENGTH = 2;
const DEBOUNCE_MS = 300;
// Stable, so `tasks` doesn't change identity every render with no search.
const NO_ROWS: TicketRow[] = [];

/**
 * The Schedule's search across every date (searchTicketsFn), a moment after
 * typing stops. `tasks` is null while a search is on its way, and [] when
 * there's no search (query under MIN_SEARCH_LENGTH). Like usePlannerTasks it
 * refetches when `boardTasks` changes, so an edit shows in the results.
 */
export function useTaskSearch({
  token,
  query,
  helper,
  statuses,
  helpers,
  boardTasks,
}: {
  token: string | null;
  query: string;
  /** "all", "unassigned" or a helper id. */
  helper: string;
  statuses: Status[];
  helpers: Helper[];
  boardTasks: Task[];
}) {
  const words = query.trim();
  const active = words.length >= MIN_SEARCH_LENGTH;
  const statusKey = statuses.join(",");
  const key = `${words}|${helper}|${statusKey}`;
  const [result, setResult] = useState<{ key: string; rows: TicketRow[] } | null>(null);

  useEffect(() => {
    if (!token || !active) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      searchTicketsFn({
        data: {
          token,
          query: words,
          helper,
          statuses: statusKey ? (statusKey.split(",") as Status[]) : [],
        },
      })
        .then((rows) => {
          if (!cancelled) setResult({ key, rows });
        })
        .catch((err) => {
          console.error("[useTaskSearch] Search failed:", err);
          if (!cancelled) setResult({ key, rows: [] });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token, active, words, helper, statusKey, key, boardTasks]);

  // Results for an earlier query aren't shown as this one's.
  const current = active ? (result?.key === key ? result.rows : null) : NO_ROWS;
  const tasks = useMemo(
    () => (current ? current.map((row) => toTask(row, helpers)) : null),
    [current, helpers],
  );

  return { active, tasks };
}
