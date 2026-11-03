import { X } from "lucide-react";
import { useState } from "react";

import type { Routine } from "../task.types";
import { timeSpan } from "../task.utils";
import { RecurrenceBadge } from "./recurrence-badge";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

export function RoutineRow({ routine, onRemove }: { routine: Routine; onRemove: () => void }) {
  const t = useT();
  // Removing stops it repeating for good, so it asks first.
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">{routine.title}</h4>
            <RecurrenceBadge recurrence={routine.recurrence} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{timeSpan(routine)}</div>
          {routine.note && (
            <div className="mt-2 rounded-xl bg-terracotta-soft/40 px-2.5 py-1.5 text-xs leading-relaxed text-pine-deep">
              <span className="mr-1 text-xs font-semibold text-pine-deep/70">
                {t("tasks.houseStandard")}
              </span>
              {routine.note}
            </div>
          )}
        </div>
        {confirming ? (
          <span className="inline-flex shrink-0 items-center gap-2 text-xs text-foreground">
            {richText(t("tasks.stopRepeating2"), {
              button: (
                <button
                  onClick={() => {
                    setConfirming(false);
                    onRemove();
                  }}
                  className="rounded-lg bg-destructive px-2.5 py-1 font-semibold text-destructive-foreground shadow-soft hover:bg-destructive/90"
                >
                  {t("tasks.stop")}
                </button>
              ),
              button2: (
                <button
                  onClick={() => setConfirming(false)}
                  className="font-semibold text-muted-foreground hover:text-foreground"
                >
                  {t("tasks.keep")}
                </button>
              ),
            })}
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            aria-label={t("tasks.removeRoutine")}
            className="rounded-full border border-border p-1.5 text-muted-foreground transition hover:border-accent/60 hover:text-accent-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
