import { AlertCircle, Moon, Send } from "lucide-react";

import { Modal } from "@/components/shared/modal";

import type { GateIntent } from "../hooks/use-send-gate";
import type { RosaStatus } from "../availability.types";

/** Friction wall before reaching a helper who is Off: wait, override, or emergency. */
export function AvailabilityGate({
  intent,
  status,
  helperName,
  canOverride = true,
  onCancel,
  onChoose,
}: {
  intent: GateIntent;
  status: RosaStatus;
  helperName: string;
  canOverride?: boolean;
  onCancel: () => void;
  onChoose: (choice: "queue" | "override" | "emergency") => void;
}) {
  const kindLabel = intent.kind === "utos" ? "quick utos" : "task";
  const preview = intent.kind === "utos" ? intent.content : intent.task.title;
  const hard = status.quiet || status.restDay || !!status.timeOff;
  const headline = status.quiet
    ? `It's quiet hours for ${helperName}.`
    : status.timeOff
      ? `${helperName} has this time off.`
      : status.restDay
        ? `It's ${helperName}'s rest day.`
        : `This is outside ${helperName}'s hours.`;
  const body = status.quiet
    ? `Overnight is protected rest. Time spent on this is logged as rest owed to ${helperName}. Only use Emergency if it truly can't wait.`
    : status.timeOff
      ? `This is time off that was approved for ${helperName}. Time spent on this is logged as rest owed.`
      : status.restDay
        ? `It's ${helperName}'s rest day. Time spent on this is logged as rest owed.`
        : `${helperName} is off-shift. Time spent on this is logged as rest owed.`;

  return (
    <Modal onClose={onCancel}>
      <div className="flex items-start gap-3">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${hard ? "bg-status-late-soft text-status-late-ink" : "bg-terracotta-soft/70 text-accent-foreground"}`}
        >
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-lg text-foreground">{headline}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl ring-1 ring-border/20 bg-secondary/40 p-3">
        <div className="text-xs font-semibold text-muted-foreground">Sending {kindLabel}</div>
        <div className="mt-1 truncate text-sm font-semibold text-foreground">{preview}</div>
      </div>

      <div className="mt-4 space-y-2">
        <button
          onClick={() => onChoose("queue")}
          className="flex w-full items-start gap-3 rounded-2xl border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-secondary/60"
        >
          <Moon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <div className="text-sm font-semibold text-foreground">
              {intent.kind === "utos" ? "Let it wait" : "Queue for next shift"}
            </div>
            <div className="text-xs text-muted-foreground">
              {intent.kind === "utos"
                ? `Sits as waiting. No ping. ${helperName} sees it when back on.`
                : `Added quietly. Appears on ${helperName}'s board next working period.`}
            </div>
          </div>
        </button>

        {canOverride ? (
          <>
            <button
              onClick={() => onChoose("override")}
              className="flex w-full items-start gap-3 rounded-2xl border border-accent/40 bg-terracotta-soft/40 p-3 text-left transition hover:bg-terracotta-soft/60"
            >
              <Send className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-ink" />
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Send anyway · after-hours
                </div>
                <div className="text-xs text-muted-foreground">
                  Overrides {helperName}'s Off status. Flagged, logged, and counted as rest owed.
                </div>
              </div>
            </button>

            <button
              onClick={() => onChoose("emergency")}
              className="flex w-full items-start gap-3 rounded-2xl border border-status-late/40 bg-status-late-soft/60 p-3 text-left transition hover:bg-status-late-soft"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-status-late-ink" />
              <div>
                <div className="text-sm font-semibold text-status-late-ink">Emergency</div>
                <div className="text-xs text-status-late-ink">
                  Crosses even quiet hours. Always logged as after-hours. Use only if it truly can't
                  wait.
                </div>
              </div>
            </button>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Reaching {helperName} off-hours is reserved for on-site admins (Primary or Co-manager).
            As a remote admin you can queue this for {helperName}'s next shift.
          </div>
        )}
      </div>

      <button
        onClick={onCancel}
        className="mt-3 w-full rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
      >
        Cancel
      </button>
    </Modal>
  );
}
