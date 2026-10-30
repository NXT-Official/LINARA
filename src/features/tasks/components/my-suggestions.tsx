import { HelpCircle, X } from "lucide-react";

import type { Helper } from "@/features/people/people.types";
import { findHelper } from "@/features/people/people.utils";

import type { Task } from "../task.types";
import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

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
  const t = useT();
  const mine = suggestions.filter((t) => (t.createdBy ?? "") === adminName);
  const others = suggestions.filter((t) => (t.createdBy ?? "") !== adminName);
  if (mine.length === 0 && others.length === 0) return null;
  return (
    <section className="rounded-3xl ring-1 ring-border/20 bg-card/70 p-4 shadow-soft sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep">
          <HelpCircle className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">
            {t("tasks.waitingOnTheOnSite")}
          </div>
          <div className="text-xs text-muted-foreground">
            {t("tasks.yourSuggestionsSitHereUntil")}
          </div>
        </div>
      </div>
      {mine.length === 0 && (
        <p className="py-2 text-sm text-muted-foreground">
          {t("tasks.nothingPendingFromYouRight")}
        </p>
      )}
      <div className="divide-y divide-border/70">
        {mine.map((task) => {
          const helper = findHelper(task.helperId, helpers);
          return (
            <div key={task.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-foreground">{task.title}</h4>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {richText(t("tasks.for"), { short: helper.short, time: task.time })}
                  </div>
                </div>
                <button
                  onClick={() => onWithdraw(task.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" /> {t("tasks.withdraw")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
