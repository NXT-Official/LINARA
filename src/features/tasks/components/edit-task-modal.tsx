import { AlertTriangle, Ban, Camera, CheckCircle2, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import { Modal } from "@/components/shared/modal";
import { Field } from "@/components/shared/field";
import type { Helper } from "@/features/people/people.types";
import type { HelperSchedule } from "@/features/shifts/shift.types";
import { isMinuteInShift } from "@/features/shifts/shift.utils";
import { approvedTimeOffAt, type TimeOff } from "@/features/shifts/time-off";
import {
  combineDateAndTime,
  displayTimeTo24h,
  householdNow,
  householdTimeZone,
  isoToISODate,
  fmtHM12,
  parseHM,
  parseISODate,
  toISODate,
  weekdayOf,
} from "@/lib/time";

import type { Task } from "../task.types";
import { taskFormErrors } from "../task.utils";
import { TaskUpdates } from "./task-updates";

export type TaskEdit = {
  title: string;
  note?: string;
  scheduledStartIso: string;
  /** null = Unassigned. */
  helperId: string | null;
};

const inputCls =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary aria-[invalid=true]:border-destructive";

/**
 * Edit a task's what, when and who. A task can be left Unassigned and given
 * to someone later (supabase/add-unassigned-tasks.sql); assigning it is what
 * puts it on her phone. The out-of-shift warning follows whoever is picked.
 */
export function EditTaskModal({
  task,
  helpers,
  scheduleFor,
  timeOff = [],
  token,
  myUserId = null,
  onClose,
  onSave,
  onCancelTask,
  onRestore,
}: {
  task: Task;
  /** Who it can go to: the household's current helpers. */
  helpers: Helper[];
  scheduleFor: (helperId: string) => HelperSchedule | undefined;
  /** Approved time off warns like an out-of-shift time does (KNOWN_GAPS O19). */
  timeOff?: TimeOff[];
  /** For the task's updates thread; without a token it isn't shown. */
  token?: string | null;
  myUserId?: string | null;
  onClose: () => void;
  onSave: (edit: TaskEdit) => void;
  /** Cancel it: it stays on the Schedule, struck through. Absent where it can't be (started or done). */
  onCancelTask?: () => void;
  /** For a cancelled task: back on the board as To-do. */
  onRestore?: () => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const cancelled = task.status === "cancelled";
  const canCancel = !!onCancelTask && (task.status === "todo" || task.status === "blocked");
  const [helperId, setHelperId] = useState<string | null>(task.helperId);
  const assignee = helpers.find((h) => h.id === helperId);
  const helperName = assignee?.short ?? "your helper";
  const schedule = helperId ? scheduleFor(helperId) : undefined;
  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");
  const [date, setDate] = useState(() =>
    task.scheduledStart ? isoToISODate(task.scheduledStart) : toISODate(householdNow()),
  );
  const [time, setTime] = useState(() => displayTimeTo24h(task.time));

  // Editing never bypasses her boundaries silently: say so when the new time
  // lands outside her shift, on a break, or on her rest day.
  const outsideShift =
    schedule && date && time
      ? !isMinuteInShift(parseHM(time), weekdayOf(parseISODate(date)), schedule)
      : false;
  const inTimeOff =
    !!helperId && !!date && !!time && !!approvedTimeOffAt(timeOff, helperId, date, parseHM(time));

  // Errors show once Save is pressed, then follow the typing.
  const [tried, setTried] = useState(false);
  const errors = tried ? taskFormErrors({ title, date, time }) : {};
  const submit = () => {
    setTried(true);
    if (Object.keys(taskFormErrors({ title, date, time })).length > 0) return;
    onSave({
      title: title.trim(),
      note: note.trim() || undefined,
      scheduledStartIso: combineDateAndTime(date, fmtHM12(time)),
      helperId,
    });
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-foreground">
          {cancelled ? "Cancelled task" : task.status === "done" ? "Done task" : "Edit task"}
        </h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {task.status === "done" && (
        // What finishing it left behind: when, by whom, and her photo (client
        // feedback 2026-10-02: a task finished with a photo showed neither).
        <div className="mt-3 rounded-xl bg-primary/10 px-3 py-2.5 text-sm text-foreground">
          <p className="flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
            Done
            {(() => {
              const by = helpers.find((h) => h.id === task.helperId)?.short;
              return by ? ` by ${by}` : "";
            })()}
            {task.finishedAt
              ? ` · ${new Date(task.finishedAt).toLocaleString("en-US", {
                  timeZone: householdTimeZone(),
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : ""}
          </p>
          {task.photo ? (
            <a
              href={task.photo}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block overflow-hidden rounded-lg ring-1 ring-border/30"
              aria-label="Open the photo full size"
            >
              <img
                src={task.photo}
                alt="Photo from finishing this task"
                className="max-h-64 w-full object-cover"
              />
            </a>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Camera className="h-3.5 w-3.5" /> No photo with this one.
            </p>
          )}
        </div>
      )}
      {cancelled && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/70 px-3 py-2 text-sm text-foreground">
          <span>
            Cancelled
            {task.cancelledBy ? ` by ${task.cancelledBy}` : ""}
            {task.cancelledAt
              ? ` on ${new Date(task.cancelledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : ""}
            . It's off the board and her phone.
          </span>
          {onRestore && (
            <button
              onClick={onRestore}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restore
            </button>
          )}
        </div>
      )}
      <div className="mt-4 space-y-3">
        <Field label="Title" error={errors.title}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!errors.title}
            className={inputCls}
          />
        </Field>
        <Field label="Assigned to">
          <select
            value={helperId ?? ""}
            onChange={(e) => setHelperId(e.target.value || null)}
            className={inputCls}
          >
            <option value="">Unassigned (decide later)</option>
            {helpers.map((h) => (
              <option key={h.id} value={h.id}>
                {h.short} · {h.station}
              </option>
            ))}
          </select>
        </Field>
        {helperId === null && (
          <p className="text-sm text-muted-foreground">
            Stays on your board only. Nobody sees it on their phone until you assign it.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" error={errors.date}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={!!errors.date}
              className={inputCls}
            />
          </Field>
          <Field label="Time" error={errors.time}>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-invalid={!!errors.time}
              className={inputCls}
            />
          </Field>
        </div>
        {(inTimeOff || outsideShift) && (
          <p className="flex items-start gap-2 rounded-xl bg-terracotta-soft/50 px-3 py-2 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-ink" />
            {inTimeOff
              ? `That's in ${helperName}'s approved time off.`
              : `That's outside ${helperName}'s shift.`}{" "}
            Doing it then counts as after-hours work and adds to rest owed.
          </p>
        )}
        <Field label="House-standard note (optional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
          />
        </Field>
      </div>
      {token && (
        <div className="mt-5 border-t border-border/60 pt-4">
          <TaskUpdates token={token} ticketId={task.id} myUserId={myUserId} />
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {canCancel &&
          (confirmingCancel ? (
            <span className="mr-auto inline-flex items-center gap-2 text-xs text-foreground">
              Cancel this task?
              <button
                onClick={onCancelTask}
                className="rounded-lg bg-destructive px-3 py-1.5 font-semibold text-destructive-foreground shadow-soft hover:bg-destructive/90"
              >
                Yes, cancel it
              </button>
              <button
                onClick={() => setConfirmingCancel(false)}
                className="font-semibold text-muted-foreground hover:text-foreground"
              >
                Keep it
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingCancel(true)}
              className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-muted-foreground hover:text-destructive"
            >
              <Ban className="h-4 w-4" /> Cancel task
            </button>
          ))}
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
        <button
          onClick={submit}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
