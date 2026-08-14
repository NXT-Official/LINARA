import { Check, HelpCircle, Link2, Play } from "lucide-react";
import { useState } from "react";

import { PalengkeChip } from "@/features/groceries/components/palengke-chip";

import type { Status, Task } from "../task.types";
import { isPalengke, recurrenceLabel } from "../task.utils";
import { RecurrenceBadge } from "./recurrence-badge";
import { RescheduleNotice } from "./reschedule-notice";

export function NextTaskCard({
  task,
  onUpdate,
  onAskBlock,
}: {
  task: Task;
  onUpdate: (id: string, s: Status, photo?: string) => void;
  onAskBlock: () => void;
}) {
  const [slideIdx, setSlideIdx] = useState(0);

  const start = () => onUpdate(task.id, "in_progress");
  const done = () => onUpdate(task.id, "done");

  // Split task.note into individual steps (slides)
  const slides = task.note
    ? task.note
        .split(/[.;•\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    : [];

  return (
    <article className="rounded-3xl border border-border/70 bg-card p-6 shadow-lift">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-foreground">
            {task.status === "in_progress" ? "In progress" : "Up next"}
          </span>
          {task.pendingSync && (
            <span className="inline-flex items-center rounded-full bg-[oklch(0.96_0.08_80)] px-2 py-0.5 text-[9px] font-semibold text-[oklch(0.38_0.09_60)] animate-pulse border border-[oklch(0.85_0.12_80)]">
              Offline Pending Sync
            </span>
          )}
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-pine-deep">
          {task.time}
        </span>
      </div>
      <h2 className="mt-3 font-display text-2xl leading-tight text-foreground">{task.title}</h2>
      {recurrenceLabel(task.recurrence) && (
        <div className="mt-2">
          <RecurrenceBadge recurrence={task.recurrence} />
        </div>
      )}
      {task.appointmentTitle && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-2 py-0.5 text-[10px] font-medium text-[oklch(0.38_0.09_60)]">
          <Link2 className="h-2.5 w-2.5" /> {task.appointmentTitle}
        </div>
      )}
      <RescheduleNotice notice={task.rescheduleNotice} newTime={task.time} />

      {slides.length > 0 && (
        <div className="mt-4 rounded-2xl bg-terracotta-soft/45 p-4 shadow-soft border border-terracotta/20 animate-fade-in">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-pine-deep/80">
              House standard · Step {slideIdx + 1} of {slides.length}
            </span>
            {slides.length > 1 && (
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSlideIdx((prev) => Math.max(0, prev - 1))}
                  disabled={slideIdx === 0}
                  className="rounded-full bg-card px-2.5 py-1 text-[10px] font-semibold border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setSlideIdx((prev) => Math.min(slides.length - 1, prev + 1))}
                  disabled={slideIdx === slides.length - 1}
                  className="rounded-full bg-card px-2.5 py-1 text-[10px] font-semibold border border-border text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
                >
                  Next
                </button>
              </div>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-pine-deep font-semibold transition-all duration-200">
            {slides[slideIdx]}
          </p>
        </div>
      )}
      {isPalengke(task) && (
        <div className="mt-4">
          <PalengkeChip to="/helper/pantry" />
        </div>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {task.status === "todo" ? (
          <button
            onClick={start}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
          >
            <Play className="h-4 w-4" /> Start
          </button>
        ) : (
          <button
            onClick={done}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground shadow-soft transition hover:opacity-95"
          >
            <Check className="h-4 w-4" /> Done
          </button>
        )}
        <button
          onClick={onAskBlock}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-3.5 text-sm font-semibold text-muted-foreground shadow-soft hover:border-accent/60 hover:text-accent-foreground sm:flex-none"
        >
          <HelpCircle className="h-4 w-4" /> Can't now / Need info
        </button>
      </div>
    </article>
  );
}
