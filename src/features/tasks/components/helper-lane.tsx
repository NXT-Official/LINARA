import { useMemo, useState } from "react";

import { STATION_HEX } from "@/features/people/people.constants";
import type { Helper } from "@/features/people/people.types";
import { parseTimeToMinutes } from "@/lib/time";

import type { Task } from "../task.types";
import { LaneNowRow } from "./lane-now-row";

export function HelperLane({ helper, tasks }: { helper: Helper; tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  const color = STATION_HEX[helper.station];
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)),
    [tasks],
  );
  const doneCount = sorted.filter((t) => t.status === "done").length;
  const inProg = sorted.find((t) => t.status === "in_progress");
  const upcoming = sorted.filter((t) => t.status === "todo" || t.status === "blocked");
  const nowTask = inProg ?? upcoming[0];
  const nextTask = upcoming.find((t) => t.id !== nowTask?.id);
  const nowMin = inProg ? parseTimeToMinutes(inProg.time) : Number.POSITIVE_INFINITY;
  const overdueSet = new Set(
    sorted
      .filter(
        (t) =>
          t.id !== inProg?.id &&
          (t.status === "todo" || t.status === "blocked") &&
          (t.status === "blocked" || parseTimeToMinutes(t.time) < nowMin),
      )
      .map((t) => t.id),
  );

  const pill =
    overdueSet.size > 0
      ? {
          text: `⚠ ${overdueSet.size} overdue`,
          cls: "bg-[oklch(0.93_0.06_35)] text-[oklch(0.42_0.15_35)]",
        }
      : inProg
        ? {
            text: `Now: ${inProg.title}`,
            cls: "bg-[oklch(0.93_0.08_75)] text-[oklch(0.4_0.13_75)]",
          }
        : { text: "On track", cls: "bg-[oklch(0.93_0.05_150)] text-[oklch(0.36_0.1_150)]" };

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
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground tabular-nums">
              {doneCount} of {sorted.length}
            </span>
          </div>
        </div>
        <span
          className={`ml-1 max-w-[42%] shrink-0 truncate rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${pill.cls}`}
        >
          {pill.text}
        </span>
      </button>

      {(nowTask || nextTask) && (
        <div className="grid gap-2 px-4 pb-3 sm:grid-cols-2">
          {nowTask && (
            <LaneNowRow
              label={inProg ? "Now" : "Next up"}
              task={nowTask}
              color={color}
              late={overdueSet.has(nowTask.id)}
            />
          )}
          {nextTask && (
            <LaneNowRow
              label="Next"
              task={nextTask}
              color={color}
              late={overdueSet.has(nextTask.id)}
              muted
            />
          )}
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
                  <span className="w-16 shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {t.time}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm ${t.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}
                    >
                      {t.title}
                    </div>
                    {t.note && (
                      <div className="mt-0.5 line-clamp-2 text-[11px] italic text-muted-foreground">
                        "{t.note}"
                      </div>
                    )}
                  </div>
                  {isLate && (
                    <span className="shrink-0 rounded-full bg-[oklch(0.93_0.06_35)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[oklch(0.42_0.15_35)]">
                      Late
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
