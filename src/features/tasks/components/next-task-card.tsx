import { Camera, Check, HelpCircle, Link2, Play } from "lucide-react";
import { useState } from "react";

import { PalengkeInlineList } from "@/features/groceries/components/palengke-inline-list";

import { PHOTO_POOL } from "../task.constants";
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
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);

  const start = () => onUpdate(task.id, "in_progress");
  const done = () => {
    setAddingPhoto(true);
    setTimeout(() => {
      const photo = PHOTO_POOL[Math.floor(Math.random() * PHOTO_POOL.length)];
      onUpdate(task.id, "done", photo);
      setAddingPhoto(false);
    }, 900);
  };

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
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-foreground">
          {task.status === "in_progress" ? "In progress" : "Up next"}
        </span>
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
          <PalengkeInlineList />
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
            disabled={addingPhoto}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground shadow-soft transition hover:opacity-95 disabled:opacity-70"
          >
            {addingPhoto ? (
              <>
                <Camera className="h-4 w-4 animate-pulse" /> Attaching photo…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Done · add photo
              </>
            )}
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
