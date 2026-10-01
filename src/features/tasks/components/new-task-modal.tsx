import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

import { Modal } from "@/components/shared/modal";
import { Field } from "@/components/shared/field";
import type { Helper } from "@/features/people/people.types";
import type { HelperSchedule } from "@/features/shifts/shift.types";
import { isMinuteInShift } from "@/features/shifts/shift.utils";
import {
  WEEKDAYS,
  householdNow,
  parseHM,
  parseISODate,
  toISODate,
  weekdayOf,
  type Weekday,
} from "@/lib/time";

import type { Recurrence, Task } from "../task.types";

export function NewTaskModal({
  activeHelpers,
  onClose,
  onAdd,
  isRemote = false,
  defaultDate,
  defaultHelperId,
  scheduleFor,
}: {
  activeHelpers: Helper[];
  onClose: () => void;
  onAdd: (t: Omit<Task, "id" | "status" | "station">, opts?: { sendLive?: boolean }) => void;
  isRemote?: boolean;
  /** YYYY-MM-DD the form opens on: the board's day, or the planner day tapped. */
  defaultDate: string;
  /** Who the form opens on: the planner row tapped ("" = Unassigned). Else the first helper. */
  defaultHelperId?: string;
  /** For the out-of-shift warning; without it there is none. */
  scheduleFor?: (helperId: string) => HelperSchedule | undefined;
}) {
  const [title, setTitle] = useState("");
  // "" = Unassigned: a task can wait on the board until someone is picked.
  const [helperId, setHelperId] = useState(defaultHelperId ?? activeHelpers[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("08:00");
  const [note, setNote] = useState("");
  const [repeatKind, setRepeatKind] = useState<"none" | "daily" | "weekdays">("none");
  const [days, setDays] = useState<Weekday[]>([]);
  const [sendLive, setSendLive] = useState(false);

  // Planning never bypasses her boundaries silently, same as Edit.
  const schedule = helperId ? scheduleFor?.(helperId) : undefined;
  const assignee = activeHelpers.find((h) => h.id === helperId);
  const outsideShift =
    schedule && date && time
      ? !isMinuteInShift(parseHM(time), weekdayOf(parseISODate(date)), schedule)
      : false;
  const todayIso = toISODate(householdNow());

  const toggleDay = (d: Weekday) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const submit = () => {
    if (!title.trim() || !date || !time) return;
    const [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    const recurrence: Recurrence =
      repeatKind === "daily"
        ? "daily"
        : repeatKind === "weekdays" && days.length > 0
          ? WEEKDAYS.filter((d) => days.includes(d)) // keep canonical order
          : "none";
    onAdd(
      {
        title: title.trim(),
        helperId: helperId || null,
        time: `${hr}:${String(m).padStart(2, "0")} ${suffix}`,
        note: note.trim() || undefined,
        recurrence,
        scheduledDate: date,
      },
      { sendLive: isRemote ? sendLive : undefined },
    );
  };

  return (
    <Modal onClose={onClose}>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl text-foreground">
          {isRemote ? "Suggest a task" : "New task"}
        </h3>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {isRemote && (
        <p className="mt-1 text-xs text-muted-foreground">
          From afar you can propose things — an on-site manager approves them onto the board.
        </p>
      )}
      <div className="mt-4 space-y-3">
        <Field label="Title">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Fold laundry"
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Assign to">
          <select
            value={helperId}
            onChange={(e) => setHelperId(e.target.value)}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          >
            <option value="">Unassigned (decide later)</option>
            {activeHelpers.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} · {h.station}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="date"
              value={date}
              min={todayIso < defaultDate ? todayIso : defaultDate}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Time">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
        {outsideShift && (
          <p className="flex items-start gap-2 rounded-xl bg-terracotta-soft/50 px-3 py-2 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-ink" />
            That's outside {assignee?.short ?? "her"}'s shift. Doing it then counts as after-hours
            work and adds to rest owed.
          </p>
        )}
        <Field label="House-standard note (optional)">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. Warm water only, fold in thirds."
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </Field>
        <Field label="Repeat">
          <div className="inline-flex w-full rounded-xl border border-input bg-background p-1">
            {(
              [
                { key: "none", label: "None" },
                { key: "daily", label: "Every day" },
                { key: "weekdays", label: "Specific days" },
              ] as const
            ).map((opt) => {
              const active = repeatKind === opt.key;
              return (
                <button
                  type="button"
                  key={opt.key}
                  onClick={() => setRepeatKind(opt.key)}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {repeatKind === "weekdays" && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const active = days.includes(d);
                return (
                  <button
                    type="button"
                    key={d}
                    onClick={() => toggleDay(d)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          )}
        </Field>
      </div>
      {isRemote && (
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-2xl ring-1 ring-border/20 bg-background/60 p-3">
          <input
            type="checkbox"
            checked={sendLive}
            onChange={(e) => setSendLive(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Send live · urgent</span> — skip
            approval and drop it straight on the board (still attributed to you).
          </span>
        </label>
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
          disabled={!title.trim() || !date || !time}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
        >
          {isRemote ? (sendLive ? "Send live" : "Send to on-site manager") : "Add to board"}
        </button>
      </div>
    </Modal>
  );
}
