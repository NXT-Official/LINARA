import { useMemo, useState } from "react";

import { stationHex, UNASSIGNED_HEX } from "@/features/people/people.constants";
import type { Helper } from "@/features/people/people.types";

import { lanePill, laneSummary } from "../lane.utils";
import { taskDayIso } from "../planner.utils";
import type { Task } from "../task.types";
import { BusyElsewhereNote } from "@/features/sharing/components/busy-elsewhere-note";
import { TripChip } from "@/features/sharing/components/trip-chip";
import { toHouseholdClock, toISODate } from "@/lib/time";
import { byStart, taskWhen } from "../task.utils";
import { CommentBadge } from "./comment-badge";
import { LaneNowRow } from "./lane-now-row";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

function laneDotClass(status: Task["status"], isLate: boolean): string {
  if (status === "done") return "bg-status-done";
  if (status === "in_progress") return "bg-accent";
  if (isLate) return "bg-status-late";
  return "bg-muted-foreground/40";
}

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
  const t = useT();
  const [open, setOpen] = useState(false);
  const color = unassigned ? UNASSIGNED_HEX : stationHex(helper.station);
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
              {unassigned ? t("tasks.onNoOnesPhoneYet") : helper.station}
            </span>
          </div>
          {!unassigned && (
            <BusyElsewhereNote helperId={helper.id} dayIso={toISODate(toHouseholdClock(nowTs))} />
          )}
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
                {richText(t("tasks.of"), { doneCount: doneCount, length: sorted.length })}
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
            <div className="px-3 py-2 text-xs text-muted-foreground">{t("tasks.noTasksToday")}</div>
          ) : (
            sorted.map((task) => {
              const isLate = overdueSet.has(task.id);
              const dotCls = laneDotClass(task.status, isLate);
              return (
                <div key={task.id} className="flex items-start gap-2.5 rounded-xl px-2 py-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotCls}`} />
                  <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                    {taskWhen(task, nowTs)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm ${task.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}
                    >
                      {onOpenTask ? (
                        <button
                          type="button"
                          onClick={() => onOpenTask(task)}
                          className="text-left underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                        >
                          {task.title}
                        </button>
                      ) : (
                        task.title
                      )}
                    </div>
                    <TripChip from={task.from} to={task.to} />
                    {task.note && (
                      <div className="mt-0.5 line-clamp-2 text-xs italic text-muted-foreground">
                        "{task.note}"
                      </div>
                    )}
                  </div>
                  <CommentBadge taskId={task.id} />
                  {isLate && (
                    <span className="shrink-0 rounded-full bg-status-late-soft px-1.5 py-0.5 text-xs font-bold text-status-late-ink">
                      {t("tasks.late")}
                    </span>
                  )}
                </div>
              );
            })
          )}
          {later.length > 0 && (
            <>
              <div className="flex items-baseline justify-between gap-2 px-3 pb-1 pt-3">
                <span className="text-xs font-semibold text-muted-foreground">
                  {t("tasks.comingUp")}
                </span>
                {onOpenPlan && taskDayIso(later[0]) && (
                  <button
                    type="button"
                    onClick={() => onOpenPlan(taskDayIso(later[0])!)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {t("tasks.seeInThePlanner")}
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
