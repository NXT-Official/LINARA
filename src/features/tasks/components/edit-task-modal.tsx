import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

import { Modal } from "@/components/shared/modal";
import { Field } from "@/components/shared/field";
import type { HelperSchedule } from "@/features/shifts/shift.types";
import { isMinuteInShift } from "@/features/shifts/shift.utils";
import {
  combineDateAndTime,
  displayTimeTo24h,
  householdNow,
  isoToISODate,
  fmtHM12,
  parseHM,
  parseISODate,
  toISODate,
  weekdayOf,
} from "@/lib/time";

import type { Task } from "../task.types";

export type TaskEdit = { title: string; note?: string; scheduledStartIso: string };

const inputCls =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";

/**
 * Edit a task's what and when. Not who: moving it to another helper is a new
 * ask to a different person, and goes through New task and its send gate.
 */
export function EditTaskModal({
  task,
  helperName,
  schedule,
  onClose,
  onSave,
}: {
  task: Task;
  helperName: string;
  schedule: HelperSchedule | undefined;
  onClose: () => void;
  onSave: (edit: TaskEdit) => void;
}) {
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

  const canSave = title.trim() !== "" && date !== "" && time !== "";
  const submit = () => {
    if (!canSave) return;
    onSave({
      title: title.trim(),
      note: note.trim() || undefined,
      scheduledStartIso: combineDateAndTime(date, fmtHM12(time)),
    });
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-foreground">Edit task</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">For {helperName}.</p>
      <div className="mt-4 space-y-3">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Time">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        {outsideShift && (
          <p className="flex items-start gap-2 rounded-xl bg-terracotta-soft/50 px-3 py-2 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-ink" />
            That's outside {helperName}'s shift. Doing it then counts as after-hours work and adds
            to rest owed.
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
      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={!canSave}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
