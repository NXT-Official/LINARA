import { X } from "lucide-react";
import { useState } from "react";

import type { Task } from "../task.types";

export function BlockReasonModal({
  task,
  onClose,
  onSubmit,
}: {
  task: Task;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const suggestions = [
    "No formula left",
    "Need more cash",
    "Waiting on delivery",
    "Sofia is not feeling well",
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl text-foreground">Can't do this now?</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Tell Ma'am briefly — she'll see it right away.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 rounded-2xl bg-secondary/60 px-3 py-2 text-xs text-pine-deep">
          <span className="font-semibold">{task.title}</span> · {task.time}
        </div>
        <div className="mt-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. No formula left"
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setReason(s)}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onSubmit(reason.trim())}
            disabled={!reason.trim()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-soft hover:opacity-95 disabled:opacity-50"
          >
            Send to Ma'am
          </button>
        </div>
      </div>
    </div>
  );
}
