import { useState } from "react";

import { stationHex } from "@/features/people/people.constants";
import type { Helper } from "@/features/people/people.types";

import { lanePill, type LaneSummary } from "../lane.utils";
import { taskDayIso } from "../planner.utils";
import type { Task } from "../task.types";
import { BusyElsewhereNote } from "@/features/sharing/components/busy-elsewhere-note";
import { TripChip } from "@/features/sharing/components/trip-chip";
import { toHouseholdClock, toISODate } from "@/lib/time";
import { byStart, taskWhen } from "../task.utils";

/**
 * Roll call: one line per person (who, what she's on, how far through the
 * day, and whether anything needs you), for a staff too large for a lane
 * each. A row opens to her day's tasks, in the same card.
 */
export function RollCall({
  helpers,
  summaries,
  upcomingFor,
  teamNameOf,
  nowTs,
  onOpenTask,
  onOpenPlan,
}: {
  helpers: Helper[];
  summaries: Map<string, LaneSummary>;
  upcomingFor: (helperId: string) => Task[];
  /** Her team, when the list isn't already grouped by team. */
  teamNameOf: (helper: Helper) => string | null;
  nowTs: number;
  onOpenTask?: (task: Task) => void;
  onOpenPlan?: (dayIso: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-3xl bg-card shadow-soft ring-1 ring-border/20">
      {helpers.map((h) => {
        const s = summaries.get(h.id);
        if (!s) return null;
        const pill = lanePill(s);
        const color = stationHex(h.station);
        const team = teamNameOf(h);
        const open = openId === h.id;
        const pct = s.total === 0 ? 0 : Math.round((s.done / s.total) * 100);
        return (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : h.id)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-secondary/30"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: color.solid }}
                aria-hidden
              >
                {h.initials}
              </span>
              <span className="w-28 min-w-0 shrink-0 sm:w-40">
                <span className="block truncate text-sm font-semibold text-foreground">
                  {h.short}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {team ? `${team} · ${h.station}` : h.station}
                </span>
                <BusyElsewhereNote helperId={h.id} dayIso={toISODate(toHouseholdClock(nowTs))} />
              </span>
              <span className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground sm:block">
                {s.nowTask ? (
                  <>
                    <span className="font-semibold tabular-nums text-foreground">
                      {taskWhen(s.nowTask, nowTs)}
                    </span>{" "}
                    {s.nowTask.title}
                  </>
                ) : null}
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-2">
                <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-secondary sm:block">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: color.solid }}
                  />
                </span>
                <span className="w-10 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                  {s.done}/{s.total}
                </span>
                <span
                  className={`max-w-[8.5rem] truncate rounded-full px-2.5 py-1 text-xs font-semibold ${pill.cls}`}
                >
                  {pill.text}
                </span>
              </span>
            </button>
            {open && (
              <DayList
                summary={s}
                later={upcomingFor(h.id)}
                nowTs={nowTs}
                onOpenTask={onOpenTask}
                onOpenPlan={onOpenPlan}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DayList({
  summary,
  later,
  nowTs,
  onOpenTask,
  onOpenPlan,
}: {
  summary: LaneSummary;
  later: Task[];
  nowTs: number;
  onOpenTask?: (task: Task) => void;
  onOpenPlan?: (dayIso: string) => void;
}) {
  const next = [...later].sort(byStart)[0];
  return (
    <div className="border-t border-border/40 bg-secondary/20 px-4 py-2">
      {summary.sorted.length === 0 && (
        <p className="py-1.5 text-xs text-muted-foreground">No tasks today.</p>
      )}
      <ul>
        {summary.sorted.map((t) => {
          const late = summary.overdueIds.has(t.id);
          const done = t.status === "done";
          return (
            <li key={t.id} className="flex items-start gap-2.5 py-1.5">
              <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                {taskWhen(t, nowTs)}
              </span>
              <span
                className={`min-w-0 flex-1 text-sm ${done ? "text-muted-foreground line-through" : "text-foreground"}`}
              >
                {onOpenTask ? (
                  <button
                    type="button"
                    onClick={() => onOpenTask(t)}
                    className="text-left underline-offset-4 hover:underline"
                  >
                    {t.title}
                  </button>
                ) : (
                  t.title
                )}
                {(t.from || t.to) && (
                  <span className="block">
                    <TripChip from={t.from} to={t.to} />
                  </span>
                )}
              </span>
              {t.status === "in_progress" && (
                <span className="shrink-0 text-xs font-semibold text-terracotta-ink">Doing</span>
              )}
              {late && (
                <span className="shrink-0 rounded-full bg-status-late-soft px-1.5 py-0.5 text-xs font-bold text-status-late-ink">
                  Late
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {next && (
        <div className="flex items-baseline justify-between gap-2 pt-1.5 text-xs text-muted-foreground">
          <span>
            Coming up: {taskWhen(next, nowTs)} {next.title}
          </span>
          {onOpenPlan && taskDayIso(next) && (
            <button
              type="button"
              onClick={() => onOpenPlan(taskDayIso(next)!)}
              className="shrink-0 font-semibold text-primary hover:underline"
            >
              See in the planner
            </button>
          )}
        </div>
      )}
    </div>
  );
}
