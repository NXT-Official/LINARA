import { useMemo, useState } from "react";

import { STATION_HEX, UNASSIGNED_HEX } from "@/features/people/people.constants";
import type { Helper } from "@/features/people/people.types";

import { lanePill, laneSummary } from "../lane.utils";
import { taskDayIso } from "../planner.utils";
import type { Task } from "../task.types";
import { TripChip } from "@/features/sharing/components/trip-chip";
import { byStart, taskWhen } from "../task.utils";
import { CommentBadge } from "./comment-badge";
import { LaneNowRow } from "./lane-now-row";

export function HelperLane({
  helper,
  tasks,
  upcoming: laterTasks,
  nowTs,
  unassigned = false,
  onOpenTask,
  onOpenPlan,
}: {
  helper: Helper;
  /** The Unassigned lane: tasks nobody has yet (helper is UNASSIGNED_HELPER). */
  unassigned?: boolean;
  /** Opens a task (edit, assign, updates). */
  onOpenTask?: (task: Task) => void;
  /** Opens the planner on a later day (YYYY-MM-DD). */
  onOpenPlan?: (dayIso: string) => void;
  /** Today's tasks for this helper. */
  tasks: Task[];
  /** Scheduled for a later day -- shown, never counted. */
  upcoming: Task[];
  nowTs: number;
}) {
  const [open, setOpen] = useState(false);
  const color = unassigned ? UNASSIGNED_HEX : STATION_HEX[helper.station];
  const summary = useMemo(() => laneSummary(tasks, nowTs), [tasks, nowTs]);
  const { sorted, inProg, nowTask, nextTask, overdueIds: overdueSet } = summary;
  const doneCount = summary.done;
  const later = useMemo(() => [...laterTasks].sort(byStart), [laterTasks]);
  // Two slots: today's now/next first; a later day's task only fills a gap,
  // and says so rather than posing as "next up" today.
  const rows: { label: string; task: Task; muted: boolean }[] = [];
  if (nowTask) rows.push({ label: inProg ? "Now" : "Next up", task: nowTask, muted: false });
  if (nextTask) rows.push({ label: "Next", task: nextTask, muted: true });
  if (rows.length < 2 && later[0]) rows.push({ label: "Coming up", task: later[0], muted: true });
  const toAssign = sorted.filter((t) => t.status !== "done").length + later.length;
  const pill = unassigned
    ? {
        text: `${toAssign} to assign`,
        cls: "bg-secondary text-muted-foreground",
      }
    : lanePill(summary);

  const pct = sorted.length === 0 ? 0 : Math.round((doneCount / sorted.length) * 100);

  return (
    <section
      className="overflow-hidden rounded-3xl border bg-card shadow-soft"
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
            <span className="text-xs font-semibold text-muted-foreground">
              {unassigned ? "On no one's phone yet" : helper.station}
            </span>
          </div>
          {/* Progress means nothing until someone is doing them. */}
          {!unassigned && (
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
          )}
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
              onOpen={onOpenTask ? () => onOpenTask(r.task) : undefined}
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
                      {onOpenTask ? (
                        <button
                          type="button"
                          onClick={() => onOpenTask(t)}
                          className="text-left underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                        >
                          {t.title}
                        </button>
                      ) : (
                        t.title
                      )}
                    </div>
                    <TripChip from={t.from} to={t.to} />
                    {t.note && (
                      <div className="mt-0.5 line-clamp-2 text-xs italic text-muted-foreground">
                        "{t.note}"
                      </div>
                    )}
                  </div>
                  <CommentBadge taskId={t.id} />
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
              <div className="flex items-baseline justify-between gap-2 px-3 pb-1 pt-3">
                <span className="text-xs font-semibold text-muted-foreground">Coming up</span>
                {onOpenPlan && taskDayIso(later[0]) && (
                  <button
                    type="button"
                    onClick={() => onOpenPlan(taskDayIso(later[0])!)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    See in the planner
                  </button>
                )}
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
