import { useMemo, useState } from "react";

import type { Helper } from "@/features/people/people.types";
import { parseTimeToMinutes } from "@/lib/time";

import type { Task } from "../task.types";
import { BoardTaskCard } from "./board-task-card";
import { NowMarker } from "./now-marker";

/** The Board layout: today's tasks by status, in time order, with a 'now' marker. */
export function TheBoardStatusLists({ tasks, helpers }: { tasks: Task[]; helpers: Helper[] }) {
  const [tab, setTab] = useState<"todo" | "doing" | "done">("todo");
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)),
    [tasks],
  );
  const todo = sorted.filter((t) => t.status === "todo" || t.status === "blocked");
  const doing = sorted.filter((t) => t.status === "in_progress");
  const done = sorted.filter((t) => t.status === "done");
  const nowMin = doing.length > 0 ? parseTimeToMinutes(doing[0].time) : null;
  const overdueId = (t: Task) =>
    t.status === "blocked" || (nowMin !== null && parseTimeToMinutes(t.time) < nowMin);

  const tabs = [
    { key: "todo" as const, label: "To-do", count: todo.length, list: todo },
    { key: "doing" as const, label: "Doing", count: doing.length, list: doing },
    { key: "done" as const, label: "Done", count: done.length, list: done },
  ];
  const current = tabs.find((t) => t.key === tab)!;

  // Insertion index for the "now" marker in the To-do timeline:
  // place it before the first todo whose time >= the current in-progress time.
  let nowMarkerIdx = -1;
  if (tab === "todo" && nowMin !== null) {
    nowMarkerIdx = todo.findIndex((t) => parseTimeToMinutes(t.time) >= nowMin);
    if (nowMarkerIdx === -1) nowMarkerIdx = todo.length; // all overdue → marker at the end
  }

  return (
    <section className="space-y-3">
      <div className="inline-flex w-full rounded-full border border-border bg-card p-1 shadow-soft">
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                active
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-pine-deep"}`}
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
            Nothing here.
          </div>
        ) : (
          current.list.map((t, i) => (
            <div key={t.id}>
              {tab === "todo" && i === nowMarkerIdx && <NowMarker />}
              <BoardTaskCard
                task={t}
                late={tab !== "done" && overdueId(t)}
                isDoing={t.status === "in_progress"}
                helpers={helpers}
              />
            </div>
          ))
        )}
        {tab === "todo" && nowMarkerIdx === current.list.length && current.list.length > 0 && (
          <NowMarker />
        )}
      </div>
    </section>
  );
}
