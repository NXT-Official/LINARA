import { Camera, HelpCircle, Link2 } from "lucide-react";
import { useState } from "react";

import { PalengkeChip } from "@/features/groceries/components/palengke-chip";
import { STATION_HEX, UNASSIGNED_HEX } from "@/features/people/people.constants";
import type { Helper } from "@/features/people/people.types";
import { findHelper } from "@/features/people/people.utils";

import type { Task } from "../task.types";
import { TripChip } from "@/features/sharing/components/trip-chip";
import { CommentBadge } from "./comment-badge";
import { RecurrenceBadge } from "./recurrence-badge";
import { RescheduleNotice } from "./reschedule-notice";

export function BoardTaskCard({
  task,
  when,
  late,
  isDoing,
  helpers,
  onOpen,
}: {
  task: Task;
  /** Display time, with the day when it isn't today (taskWhen). */
  when: string;
  late: boolean;
  isDoing: boolean;
  helpers: Helper[];
  /** Opens the task (edit, assign, updates). Managers on site only. */
  onOpen?: () => void;
}) {
  const [showNote, setShowNote] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const helper = findHelper(task.helperId, helpers);
  const color = task.helperId ? STATION_HEX[task.station] : UNASSIGNED_HEX;
  const isDone = task.status === "done";
  // "Thu 7:30 PM" -> "Thu" over "7:30 PM", so the narrow column never splits the time.
  const day = when.endsWith(task.time)
    ? when.slice(0, -task.time.length).replace(/,?\s*$/, "")
    : "";
  return (
    <article className="overflow-hidden rounded-2xl ring-1 ring-border/20 bg-card shadow-soft">
      <div className="flex items-start gap-2.5 p-3">
        <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold leading-tight tabular-nums text-muted-foreground">
          {day && <span className="block">{day}</span>}
          {day ? task.time : when}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4
              className={`text-sm font-semibold ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}
            >
              {onOpen ? (
                <button
                  type="button"
                  onClick={onOpen}
                  className="text-left underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                >
                  {task.title}
                </button>
              ) : (
                task.title
              )}
            </h4>
            <TripChip from={task.from} to={task.to} />
            {isDoing && (
              <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-xs font-bold text-accent-foreground">
                Doing
              </span>
            )}
            {late && (
              <span className="rounded-full bg-status-late-soft px-1.5 py-0.5 text-xs font-bold text-status-late-ink">
                Late
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: color.soft, color: "var(--pine-deep)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color.solid }} />
              {task.helperId ? `${task.station} · ${helper.short}` : "Unassigned"}
            </span>
            <RecurrenceBadge recurrence={task.recurrence} />
            {task.appointmentTitle && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-xs font-medium text-pine-deep">
                <Link2 className="h-2.5 w-2.5" /> {task.appointmentTitle}
              </span>
            )}
            {task.note && (
              <button
                onClick={() => setShowNote((s) => !s)}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <HelpCircle className="h-2.5 w-2.5" /> {showNote ? "Hide note" : "Note"}
              </button>
            )}
            {isDone && task.photo && (
              <button
                onClick={() => setShowPhoto((s) => !s)}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <Camera className="h-2.5 w-2.5" /> {showPhoto ? "Hide photo" : "Photo"}
              </button>
            )}
            <PalengkeChip task={task} />
            <CommentBadge taskId={task.id} />
          </div>
          <RescheduleNotice task={task} />
          {showNote && task.note && (
            <p className="mt-2 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
              "{task.note}"
            </p>
          )}
          {showPhoto && task.photo && (
            <div className="mt-2 overflow-hidden rounded-xl">
              <img
                src={task.photoThumb ?? task.photo}
                alt=""
                className="h-28 w-full object-cover"
                loading="lazy"
              />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
