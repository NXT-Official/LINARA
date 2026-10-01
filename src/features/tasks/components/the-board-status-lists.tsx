import { useMemo, useState } from "react";

import type { Helper } from "@/features/people/people.types";
import { parseTimeToMinutes, toHouseholdClock } from "@/lib/time";

import type { Task } from "../task.types";
import { byStart, isPastDue, taskWhen } from "../task.utils";
import { BoardTaskCard } from "./board-task-card";
import { NowMarker } from "./now-marker";

/**
 * The Board layout: today's tasks by status, in time order, with a 'now'
 * marker; later days' tasks follow under "Coming up" and aren't counted.
 */
export function TheBoardStatusLists({
  tasks,
  upcoming,
  helpers,
  nowTs,
  onOpenTask,
}: {
  tasks: Task[];
  upcoming: Task[];
  helpers: Helper[];
  onOpenTask?: (task: Task) => void;
  nowTs: number;
}) {
  const [tab, setTab] = useState<"todo" | "doing" | "done">("todo");
  const sorted = useMemo(() => [...tasks].sort(byStart), [tasks]);
  const later = useMemo(() => [...upcoming].sort(byStart), [upcoming]);
  const todo = sorted.filter((t) => t.status === "todo" || t.status === "blocked");
  const doing = sorted.filter((t) => t.status === "in_progress");
  const done = sorted.filter((t) => t.status === "done");
  const now = toHouseholdClock(nowTs);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const overdueId = (t: Task) => t.status === "blocked" || isPastDue(t, nowTs);

  const tabs = [
    { key: "todo" as const, label: "To-do", count: todo.length, list: todo },
    { key: "doing" as const, label: "Doing", count: doing.length, list: doing },
    { key: "done" as const, label: "Done", count: done.length, list: done },
  ];
  const current = tabs.find((t) => t.key === tab)!;

  // Insertion index for the "now" marker in the To-do timeline:
  // place it before the first todo that starts at or after the current moment.
  let nowMarkerIdx = -1;
  if (tab === "todo") {
    nowMarkerIdx = todo.findIndex((t) => {
      const ms = t.scheduledStart ? Date.parse(t.scheduledStart) : Number.NaN;
      return Number.isNaN(ms) ? parseTimeToMinutes(t.time) >= nowMin : ms >= nowTs;
    });
    if (nowMarkerIdx === -1) nowMarkerIdx = todo.length; // all overdue → marker at the end
  }

  return (
    <section className="space-y-3">
      <div className="inline-flex w-full rounded-xl border border-border bg-card p-1 shadow-soft">
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                active
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-pine-deep"}`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5">
        {current.list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            {tab === "todo" ? "Nothing left for today." : "Nothing here."}
          </div>
        ) : (
          current.list.map((t, i) => (
            <div key={t.id}>
              {tab === "todo" && i === nowMarkerIdx && <NowMarker />}
              <BoardTaskCard
                task={t}
                when={taskWhen(t, nowTs)}
                late={tab !== "done" && overdueId(t)}
                isDoing={t.status === "in_progress"}
                helpers={helpers}
                onOpen={onOpenTask ? () => onOpenTask(t) : undefined}
              />
            </div>
          ))
        )}
        {tab === "todo" && nowMarkerIdx === current.list.length && current.list.length > 0 && (
          <NowMarker />
        )}
        {tab === "todo" && later.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-1 pt-2">
              <span className="text-xs font-semibold text-muted-foreground">Coming up</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {later.map((t) => (
              <BoardTaskCard
                key={t.id}
                task={t}
                when={taskWhen(t, nowTs)}
                late={false}
                isDoing={false}
                helpers={helpers}
                onOpen={onOpenTask ? () => onOpenTask(t) : undefined}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}
