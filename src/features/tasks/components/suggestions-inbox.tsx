import { Check, HelpCircle, X } from "lucide-react";

import { Avatar } from "@/components/shared/avatar";
import { stationTone } from "@/features/people/people.constants";
import type { Helper } from "@/features/people/people.types";
import { findHelper } from "@/features/people/people.utils";

import type { Task } from "../task.types";

/** Remote-admin suggestions awaiting an on-site manager's approval onto the board. */
export function SuggestionsInbox({
  suggestions,
  helpers,
  onApprove,
  onDismiss,
}: {
  suggestions: Task[];
  helpers: Helper[];
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  // Group by who suggested it.
  const groups = new Map<string, Task[]>();
  for (const t of suggestions) {
    const key = t.createdBy ?? "A remote admin";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return (
    <section className="rounded-3xl border border-terracotta/40 bg-terracotta-soft/30 p-4 shadow-soft sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-terracotta/20 text-[oklch(0.42_0.15_60)]">
          <HelpCircle className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">
            Suggested by remote admins · {suggestions.length}
          </div>
          <div className="text-xs text-muted-foreground">
            Approve to place on the board, or dismiss quietly.
          </div>
        </div>
      </div>
      <div className="space-y-4">
        {[...groups.entries()].map(([who, items]) => (
          <div key={who}>
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-pine-deep">
              From {who}
            </div>
            <div className="space-y-2">
              {items.map((t) => {
                const helper = findHelper(t.helperId, helpers);
                return (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-foreground">{t.title}</h4>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Avatar initials={helper.initials} />
                          <span className="font-semibold text-foreground">{helper.short}</span>
                          <span>·</span>
                          <span>{t.time}</span>
                        </div>
                        {t.note && <p className="mt-1.5 text-xs text-muted-foreground">{t.note}</p>}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stationTone[t.station]}`}
                      >
                        {t.station}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => onApprove(t.id)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve to board
                      </button>
                      <button
                        onClick={() => onDismiss(t.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" /> Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
