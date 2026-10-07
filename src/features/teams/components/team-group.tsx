import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * One team's block in a staff view: a header that says how the team is doing
 * at a glance, and opens to the people in it. In a large household teams
 * start closed, so the page is a list of departments rather than a hundred
 * lanes.
 */
export function TeamGroup({
  title,
  count,
  summary,
  attention = 0,
  defaultOpen,
  children,
}: {
  title: string;
  /** How many people are in it. */
  count: number;
  /** One line of the team's day: "12 of 30 done". */
  summary?: ReactNode;
  /** How many things in it need the manager; shown even while closed. */
  attention?: number;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left shadow-soft ring-1 ring-border/20 transition hover:bg-secondary/40"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "" : "-rotate-90"}`}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate font-display text-base text-foreground">{title}</span>
            <span className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
              {count} {count === 1 ? "person" : "people"}
            </span>
          </span>
          {summary && <span className="mt-0.5 block text-xs text-muted-foreground">{summary}</span>}
        </span>
        {attention > 0 && (
          <span className="shrink-0 rounded-full bg-status-late-soft px-2.5 py-1 text-xs font-semibold text-status-late-ink">
            {attention} {attention === 1 ? "needs" : "need"} you
          </span>
        )}
      </button>
      {open && children}
    </section>
  );
}
