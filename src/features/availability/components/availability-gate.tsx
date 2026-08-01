import { AlertCircle, Moon, Send } from "lucide-react";

import type { Task } from "@/features/tasks/task.types";

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
  intent:
    | { kind: "utos"; content: string }
    | { kind: "task"; task: Omit<Task, "id" | "status" | "station"> };
  status: RosaStatus;
  helperName: string;
  canOverride?: boolean;
  onCancel: () => void;
  onChoose: (choice: "queue" | "override" | "emergency") => void;
}) {
  const kindLabel = intent.kind === "utos" ? "quick utos" : "task";
  const preview = intent.kind === "utos" ? intent.content : intent.task.title;
  const hard = status.quiet || status.restDay;
  const headline = status.quiet
    ? `It's quiet hours for ${helperName}.`
    : status.restDay
      ? `It's ${helperName}'s rest day.`
      : `This is outside ${helperName}'s hours.`;
  const body = status.quiet
    ? `Overnight is protected rest. Sending anyway will be logged as after-hours and counted toward OT / rest — an override on quiet hours. Only use Emergency if it truly can't wait.`
    : status.restDay
      ? `Her rest day is protected. It'll be logged as after-hours and counted toward OT / rest.`
      : `It'll be logged as after-hours and counted toward OT / rest.`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-3xl bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start gap-3">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${hard ? "bg-[oklch(0.95_0.06_35)] text-[oklch(0.42_0.15_35)]" : "bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]"}`}
          >
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg text-foreground">{headline}</div>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/70 bg-secondary/40 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sending {kindLabel}
          </div>
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
                  ? "Sits as waiting. No ping. She'll see it when she's back on."
                  : "Added quietly. Appears on her board next working period."}
              </div>
            </div>
          </button>

          {canOverride ? (
            <>
              <button
                onClick={() => onChoose("override")}
                className="flex w-full items-start gap-3 rounded-2xl border border-accent/40 bg-terracotta-soft/40 p-3 text-left transition hover:bg-terracotta-soft/60"
              >
                <Send className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.42_0.13_60)]" />
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Send anyway · after-hours
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Overrides her Off status. Flagged, logged, and counted toward OT / rest.
                  </div>
                </div>
              </button>

              <button
                onClick={() => onChoose("emergency")}
                className="flex w-full items-start gap-3 rounded-2xl border border-[oklch(0.75_0.15_35)] bg-[oklch(0.96_0.05_35)] p-3 text-left transition hover:bg-[oklch(0.93_0.07_35)]"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.5_0.18_30)]" />
                <div>
                  <div className="text-sm font-semibold text-[oklch(0.35_0.15_30)]">Emergency</div>
                  <div className="text-xs text-[oklch(0.4_0.1_30)]">
                    Crosses even quiet hours. Always logged as after-hours. Use only if it truly
                    can't wait.
                  </div>
                </div>
              </button>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Reaching {helperName} off-hours is reserved for on-site admins (Primary or
              Co-manager). As a remote admin you can queue this for her next shift.
            </div>
          )}
        </div>

        <button
          onClick={onCancel}
          className="mt-3 w-full rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
