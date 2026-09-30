import { useMemo, useState } from "react";

import { STATION_HEX } from "@/features/people/people.constants";
import type { Helper } from "@/features/people/people.types";

import type { Task } from "../task.types";
import { byStart, isPastDue, taskWhen } from "../task.utils";
import { LaneNowRow } from "./lane-now-row";

export function HelperLane({
  helper,
  tasks,
  upcoming: laterTasks,
  nowTs,
}: {
  helper: Helper;
  /** Today's tasks for this helper. */
  tasks: Task[];
  /** Scheduled for a later day -- shown, never counted. */
  upcoming: Task[];
  nowTs: number;
}) {
  const [open, setOpen] = useState(false);
  const color = STATION_HEX[helper.station];
  const sorted = useMemo(() => [...tasks].sort(byStart), [tasks]);
  const doneCount = sorted.filter((t) => t.status === "done").length;
  const inProg = sorted.find((t) => t.status === "in_progress");
  const upcoming = sorted.filter((t) => t.status === "todo" || t.status === "blocked");
  const nowTask = inProg ?? upcoming[0];
  const nextTask = upcoming.find((t) => t.id !== nowTask?.id);
  const later = useMemo(() => [...laterTasks].sort(byStart), [laterTasks]);
  // Two slots: today's now/next first; a later day's task only fills a gap,
  // and says so rather than posing as "next up" today.
  const rows: { label: string; task: Task; muted: boolean }[] = [];
  if (nowTask) rows.push({ label: inProg ? "Now" : "Next up", task: nowTask, muted: false });
  if (nextTask) rows.push({ label: "Next", task: nextTask, muted: true });
  if (rows.length < 2 && later[0]) rows.push({ label: "Coming up", task: later[0], muted: true });
  // Same rule as Needs You: blocked, or past its planned time on the clock.
  const overdueSet = new Set(
    sorted.filter((t) => t.status === "blocked" || isPastDue(t, nowTs)).map((t) => t.id),
  );

  const pill =
    overdueSet.size > 0
      ? {
          text: `${overdueSet.size} ${overdueSet.size === 1 ? "needs" : "need"} you`,
          cls: "bg-[oklch(0.93_0.06_35)] text-[oklch(0.42_0.15_35)]",
        }
      : inProg
        ? {
            text: `Now: ${inProg.title}`,
            cls: "bg-[oklch(0.93_0.08_75)] text-[oklch(0.4_0.13_75)]",
          }
        : sorted.length === 0
          ? { text: "Nothing today", cls: "bg-secondary text-muted-foreground" }
          : { text: "On track", cls: "bg-[oklch(0.93_0.05_150)] text-[oklch(0.36_0.1_150)]" };

  const pct = sorted.length === 0 ? 0 : Math.round((doneCount / sorted.length) * 100);

  return (
    <section
      className="overflow-hidden rounded-[2rem] border bg-card shadow-soft"
      style={{ borderColor: `${color.solid}55` }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-secondary/30"
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-white shadow-soft"
          style={{ backgroundColor: color.solid }}
        >
          {helper.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-base text-foreground">{helper.short}</span>
            <span className="text-xs font-semibold tracking-[0.14em] text-muted-foreground">
              {helper.station}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: color.solid }}
              />
            </div>
            <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
              {doneCount} of {sorted.length}
            </span>
          </div>
        </div>
        <span
          className={`ml-1 max-w-[42%] shrink-0 truncate rounded-full px-2.5 py-1 text-xs font-semibold ${pill.cls}`}
        >
          {pill.text}
        </span>
      </button>

      {rows.length > 0 && (
        <div className="grid gap-2 px-4 pb-3 sm:grid-cols-2">
          {rows.map((r) => (
            <LaneNowRow
              key={r.task.id}
              label={r.label}
              task={r.task}
              when={taskWhen(r.task, nowTs)}
              color={color}
              late={overdueSet.has(r.task.id)}
              muted={r.muted}
            />
          ))}
        </div>
      )}

      {open && (
        <div className="border-t border-border/60 px-2 py-2">
          {sorted.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No tasks today.</div>
          ) : (
            sorted.map((t) => {
              const isLate = overdueSet.has(t.id);
              const dotCls =
                t.status === "done"
                  ? "bg-[oklch(0.68_0.14_150)]"
                  : t.status === "in_progress"
                    ? "bg-accent"
                    : isLate
                      ? "bg-[oklch(0.6_0.18_35)]"
                      : "bg-muted-foreground/40";
              return (
                <div key={t.id} className="flex items-start gap-2.5 rounded-xl px-2 py-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotCls}`} />
                  <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                    {taskWhen(t, nowTs)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm ${t.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}
                    >
                      {t.title}
                    </div>
                    {t.note && (
                      <div className="mt-0.5 line-clamp-2 text-xs italic text-muted-foreground">
                        "{t.note}"
                      </div>
                    )}
                  </div>
                  {isLate && (
                    <span className="shrink-0 rounded-full bg-[oklch(0.93_0.06_35)] px-1.5 py-0.5 text-xs font-bold text-[oklch(0.42_0.15_35)]">
                      Late
                    </span>
                  )}
                </div>
              );
            })
          )}
          {later.length > 0 && (
            <>
              <div className="px-3 pb-1 pt-3 text-xs font-semibold text-muted-foreground">
                Coming up
              </div>
              {later.map((t) => (
                <div key={t.id} className="flex items-start gap-2.5 rounded-xl px-2 py-2">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-muted-foreground/40" />
                  <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                    {taskWhen(t, nowTs)}
                  </span>
                  <div className="min-w-0 flex-1 text-sm text-muted-foreground">{t.title}</div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
