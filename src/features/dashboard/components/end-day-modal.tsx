import { Clock, Moon, RotateCcw, X } from "lucide-react";

import { Modal } from "@/components/shared/modal";

/**
 * Confirms "End the day" (`households.board_closed`). It used to be a
 * one-tap "Close board" switch in the header, which the client read as
 * deleting the board (feedback, 2026-10-02). Nothing is deleted: her app
 * shows the day as finished, and anything added for today waits.
 */
export function EndDayModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal onClose={onCancel}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-xl text-foreground">End the day?</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            For when your staff&rsquo;s work is done for today.
          </p>
        </div>
        <button
          onClick={onCancel}
          aria-label="Close"
          className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-2.5">
        <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-secondary/40 px-3.5 py-3 text-xs text-foreground">
          <Moon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>Their app shows today as finished, so they can rest.</span>
        </div>
        <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-secondary/40 px-3.5 py-3 text-xs text-foreground">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>Anything you add for today waits until the day reopens.</span>
        </div>
        <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-secondary/40 px-3.5 py-3 text-xs text-foreground">
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            Nothing is deleted. You can reopen today from the Pass, and the next day starts open.
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          End the day
        </button>
      </div>
    </Modal>
  );
}
