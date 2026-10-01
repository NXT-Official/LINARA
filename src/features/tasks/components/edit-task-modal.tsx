import { AlertTriangle, X } from "lucide-react";
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
  isoToISODate,
  fmtHM12,
  parseHM,
  parseISODate,
  toISODate,
  weekdayOf,
} from "@/lib/time";

import type { Task } from "../task.types";
import { TaskUpdates } from "./task-updates";

export type TaskEdit = {
  title: string;
  note?: string;
  scheduledStartIso: string;
  /** null = Unassigned. */
  helperId: string | null;
};

const inputCls =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary";

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
}) {
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

  const canSave = title.trim() !== "" && date !== "" && time !== "";
  const submit = () => {
    if (!canSave) return;
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
        <h3 className="font-display text-xl text-foreground">Edit task</h3>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 space-y-3">
        <Field label="Title">
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
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
