import { ChevronDown, ChevronUp } from "lucide-react";
import { Children, useState, type ReactNode } from "react";

/**
 * Shows the first `limit` children and a "Show N more" toggle for the rest,
 * so a list that grows with time (unpaid cutoffs, a bad day's stuck tasks)
 * can't push everything below it off the screen. Children keep their own
 * keys; nested arrays from .map() are flattened.
 */
export function CappedList({
  children,
  limit = 3,
  noun,
  className,
}: {
  children: ReactNode;
  limit?: number;
  /** What the toggle counts, singular and plural: ["task", "tasks"]. */
  noun: [string, string];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const items = Children.toArray(children);
  const hidden = items.length - limit;

  return (
    <>
      <div className={className}>{open || hidden <= 0 ? items : items.slice(0, limit)}</div>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
        >
          {open ? (
            <>
              <ChevronUp className="h-3.5 w-3.5" /> Show fewer
            </>
          ) : (
            <>
              <ChevronDown className="h-3.5 w-3.5" /> Show {hidden} more{" "}
              {hidden === 1 ? noun[0] : noun[1]}
            </>
          )}
        </button>
      )}
    </>
  );
}
