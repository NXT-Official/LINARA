import { AlertCircle, Check } from "lucide-react";

import { formatTimeOfDay } from "@/lib/time";

import type { QuickUtos } from "../utos.types";

export function UtosChip({
  utos,
  onAck,
  available,
}: {
  utos: QuickUtos;
  onAck: (id: string, ack: "seen" | "done") => void;
  available: boolean;
}) {
  const acked = utos.ackState === "seen" || utos.ackState === "done";
  const waiting = (!available || utos.waiting) && !acked;

  const accent = utos.emergency
    ? "border-l-[oklch(0.55_0.2_30)]"
    : waiting
      ? "border-l-muted-foreground/30"
      : acked
        ? "border-l-primary"
        : "border-l-accent";
  const bg = waiting ? "bg-muted/40" : "bg-card";
  const textTone = waiting ? "text-muted-foreground" : "text-foreground";

  return (
    <li
      className={`flex flex-col gap-2 rounded-2xl border border-border/70 ${bg} p-3 pl-3.5 shadow-soft border-l-4 ${accent}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`truncate text-sm font-semibold ${textTone}`}>{utos.content}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>
              {formatTimeOfDay(utos.timestamp)} · from {utos.from}
            </span>
            {utos.emergency && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.95_0.06_35)] px-1.5 py-0.5 text-[10px] font-semibold text-[oklch(0.42_0.15_30)]">
                <AlertCircle className="h-2.5 w-2.5" /> Emergency
              </span>
            )}
            {utos.afterHours && !utos.emergency && (
              <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-1.5 py-0.5 text-[10px] font-semibold text-[oklch(0.38_0.09_60)]">
                After-hours
              </span>
            )}
          </div>
        </div>
        {acked ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Check className="h-3 w-3" /> {utos.ackState === "done" ? "Done" : "Got it"}
          </span>
        ) : null}
      </div>

      {waiting ? (
        <p className="text-[11px] italic text-muted-foreground">
          Waiting — Rosa is off. She'll see it when she's back.
        </p>
      ) : !acked ? (
        <div className="flex gap-2">
          <button
            onClick={() => onAck(utos.id, "seen")}
            className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/40 hover:bg-secondary"
          >
            Got it
          </button>
          <button
            onClick={() => onAck(utos.id, "done")}
            className="flex-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
          >
            Done
          </button>
        </div>
      ) : null}
    </li>
  );
}
