import { X } from "lucide-react";
import { useState } from "react";

import { Field } from "@/components/shared/field";
import type { Task } from "@/features/tasks/task.types";

export function NoteToTaskModal({
  initialTitle,
  helperId,
  createdBy,
  onClose,
  onSubmit,
}: {
  initialTitle: string;
  helperId: string;
  createdBy: string;
  onClose: () => void;
  onSubmit: (t: Omit<Task, "id" | "status" | "station">) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [time, setTime] = useState("15:00");
  const [note, setNote] = useState("");

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    onSubmit({
      title: trimmed,
      helperId,
      time: `${hr}:${String(m).padStart(2, "0")} ${suffix}`,
      note: note.trim() || undefined,
      recurrence: "none",
      createdBy,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl text-foreground">Make it a task</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Give this note a time so it gets on the board and has a record.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
          <Field label="Note (optional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Any detail to remember"
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
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
            Add to board
          </button>
        </div>
      </div>
    </div>
  );
}
