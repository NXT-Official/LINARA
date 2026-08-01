import { Check, Sparkles } from "lucide-react";

import type { Task } from "@/features/tasks/task.types";

/** The OFW view: what got done today, mostly as photos. Read-only by design. */
export function RemoteGlance({
  active,
  helperName,
  adminName,
}: {
  active: Task[];
  helperName: string;
  adminName: string;
}) {
  const doneToday = active.filter((t) => t.status === "done");
  const donePhotos = doneToday.filter((t) => t.photo).slice(0, 6);
  return (
    <section className="rounded-3xl border border-primary/20 bg-secondary/40 p-5 shadow-soft sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine-deep/80">
            Your OFW view · {adminName}
          </div>
          <h2 className="mt-0.5 font-display text-lg text-foreground">Home is holding steady.</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            You're watching from afar — schedules and off-hours reaches stay with the on-site
            managers. What you see here is the day, the money, and anything waiting on your yes.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Done today · {helperName} & team
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Check className="h-3 w-3" /> {doneToday.length}
          </span>
        </div>
        {donePhotos.length > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {donePhotos.map((t) => (
              <div key={t.id} className="overflow-hidden rounded-xl border border-border/70">
                <img
                  src={t.photo}
                  alt={t.title}
                  className="h-16 w-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs italic text-muted-foreground">
            Photos from finished tasks will show up here — a quiet way to see the day.
          </p>
        )}
        {doneToday.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {doneToday.slice(0, 4).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground">{t.title}</span>
                <span className="shrink-0 text-muted-foreground">{t.time}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
