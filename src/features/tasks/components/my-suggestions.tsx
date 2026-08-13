import { HelpCircle, X } from "lucide-react";

import type { Helper } from "@/features/people/people.types";
import { findHelper } from "@/features/people/people.utils";

import type { Task } from "../task.types";

/** A remote admin's own pending suggestions, with the option to withdraw one. */
export function MySuggestions({
  suggestions,
  helpers,
  onWithdraw,
  adminName,
}: {
  suggestions: Task[];
  helpers: Helper[];
  onWithdraw: (id: string) => void;
  adminName: string;
}) {
  const mine = suggestions.filter((t) => (t.createdBy ?? "") === adminName);
  const others = suggestions.filter((t) => (t.createdBy ?? "") !== adminName);
  if (mine.length === 0 && others.length === 0) return null;
  return (
    <section className="rounded-3xl border border-border/70 bg-card/70 p-4 shadow-soft sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep">
          <HelpCircle className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">
            Waiting on the on-site manager
          </div>
          <div className="text-xs text-muted-foreground">
            Your suggestions sit here until Ben or Tina approves them.
          </div>
        </div>
      </div>
      {mine.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border/70 bg-background/60 p-3 text-xs italic text-muted-foreground">
          Nothing pending from you right now.
        </p>
      )}
      <div className="space-y-2">
        {mine.map((t) => {
          const helper = findHelper(t.helperId, helpers);
          return (
            <div key={t.id} className="rounded-2xl border border-border/70 bg-background/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-foreground">{t.title}</h4>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    For {helper.short} · {t.time}
                  </div>
                </div>
                <button
                  onClick={() => onWithdraw(t.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" /> Withdraw
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
