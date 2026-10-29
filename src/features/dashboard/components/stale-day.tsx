import { CalendarClock, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { formatSimDate, parseISODate } from "@/lib/time";

/**
 * The board is more than two weeks behind: says so plainly, and moves it to
 * today in one tap. Unfinished tasks carry over as past due, as every day's do.
 */
export function StaleDayNotice({
  from,
  today,
  onMove,
}: {
  from: Date;
  today: string;
  onMove: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const move = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    const ok = await onMove().catch(() => false);
    inFlight.current = false;
    setBusy(false);
    if (!ok) setFailed(true);
  };

  return (
    <section className="rounded-3xl bg-terracotta-soft p-5 text-hearth-ink sm:p-7">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p role="status" className="text-sm font-semibold">
            This board is still on {formatSimDate(from)}. Today is{" "}
            {formatSimDate(parseISODate(today))}.
          </p>
          <p className="mt-1 text-sm">
            Move it to today to start fresh. Unfinished tasks come along as past due.
          </p>
          {failed ? (
            <p role="alert" className="mt-2 text-sm font-semibold text-status-late-ink">
              Couldn&apos;t move the board. Check your connection and try again.
            </p>
          ) : null}
          <button
            type="button"
            onClick={move}
            disabled={busy}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-soft transition-colors duration-150 ease-out hover:bg-pine-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:translate-y-0"
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : null}
            Move to today
          </button>
        </div>
      </div>
    </section>
  );
}
