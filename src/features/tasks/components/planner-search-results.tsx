import { Loader2 } from "lucide-react";

import type { Helper } from "@/features/people/people.types";
import { parseISODate } from "@/lib/time";

import { TASK_SEARCH_LIMIT, taskDayIso } from "../planner.utils";
import type { Task } from "../task.types";
import { PlannerTaskRow } from "./planner-day-column";

const dayHeading = (iso: string) =>
  parseISODate(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/**
 * The Schedule's search results, from every date, newest day first
 * (KNOWN_GAPS.md O32: finding an old task). A task opens as it does on the
 * calendar; each day can also be shown in its week.
 */
export function PlannerSearchResults({
  query,
  tasks,
  helpers,
  nowTs,
  onOpenTask,
  onShowDay,
}: {
  query: string;
  /** null while the search is on its way. */
  tasks: Task[] | null;
  helpers: Helper[];
  nowTs: number;
  onOpenTask?: (task: Task) => void;
  onShowDay: (dayIso: string) => void;
}) {
  if (tasks === null) {
    return (
      <p className="flex items-center gap-2 px-1 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Searching every date…
      </p>
    );
  }

  if (tasks.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        No task on any date matches “{query.trim()}”.
      </p>
    );
  }

  // Newest day first; within a day, in time order as on the calendar.
  const byDay = new Map<string, Task[]>();
  for (const t of tasks) {
    const day = taskDayIso(t);
    if (!day) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), t]);
  }
  const days = [...byDay.keys()].sort().reverse();

  return (
    <div className="space-y-3">
      <p className="px-1 text-sm text-muted-foreground" aria-live="polite">
        {tasks.length === TASK_SEARCH_LIMIT
          ? `The ${TASK_SEARCH_LIMIT} most recent tasks matching “${query.trim()}”. Add a word to narrow it.`
          : `${tasks.length} ${tasks.length === 1 ? "task matches" : "tasks match"} “${query.trim()}”, on any date.`}
      </p>
      {days.map((day) => (
        <section
          key={day}
          aria-label={dayHeading(day)}
          className="overflow-hidden rounded-2xl border border-border bg-card"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
            <h3 className="text-xs font-semibold text-foreground">{dayHeading(day)}</h3>
            <button
              type="button"
              onClick={() => onShowDay(day)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Show in week
            </button>
          </div>
          <ul className="divide-y divide-border/60">
            {[...byDay.get(day)!]
              .sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""))
              .map((t) => (
                <PlannerTaskRow
                  key={t.id}
                  task={t}
                  helpers={helpers}
                  nowTs={nowTs}
                  onOpen={onOpenTask ? () => onOpenTask(t) : undefined}
                />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
