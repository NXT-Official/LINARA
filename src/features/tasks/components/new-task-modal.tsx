import { X } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/shared/field";
import type { Helper } from "@/features/people/people.types";
import { WEEKDAYS, type Weekday } from "@/lib/time";

import type { Recurrence, Task } from "../task.types";

export function NewTaskModal({
  activeHelpers,
  onClose,
  onAdd,
  isRemote = false,
}: {
  activeHelpers: Helper[];
  onClose: () => void;
  onAdd: (t: Omit<Task, "id" | "status" | "station">, opts?: { sendLive?: boolean }) => void;
  isRemote?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [helperId, setHelperId] = useState(activeHelpers[0]?.id ?? "");
  const [time, setTime] = useState("08:00");
  const [note, setNote] = useState("");
  const [repeatKind, setRepeatKind] = useState<"none" | "daily" | "weekdays">("none");
  const [days, setDays] = useState<Weekday[]>([]);
  const [sendLive, setSendLive] = useState(false);

  const toggleDay = (d: Weekday) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const submit = () => {
    if (!title.trim() || !helperId) return;
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
        helperId,
        time: `${hr}:${String(m).padStart(2, "0")} ${suffix}`,
        note: note.trim() || undefined,
        recurrence,
      },
      { sendLive: isRemote ? sendLive : undefined },
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assign to">
              <select
                value={helperId}
                onChange={(e) => setHelperId(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                {activeHelpers.length === 0 && <option value="">No active helpers yet</option>}
                {activeHelpers.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} · {h.station}
                  </option>
                ))}
              </select>
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
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
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
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border/70 bg-background/60 p-3">
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
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
          >
            {isRemote ? (sendLive ? "Send live" : "Send to on-site manager") : "Add to board"}
          </button>
        </div>
      </div>
    </div>
  );
}
