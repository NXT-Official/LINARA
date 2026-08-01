import { useMounted } from "@/hooks/use-mounted";
import { formatTimeOfDay } from "@/lib/time";

import { QUIET_END_HOUR, QUIET_START_HOUR } from "../availability.constants";
import type { RosaStatus } from "../availability.types";

export function RosaAvailControl({
  status,
  onAvailable,
  onOff,
}: {
  status: RosaStatus;
  onAvailable: (hours: number) => void;
  onOff: () => void;
}) {
  const mounted = useMounted();
  if (!mounted) {
    return (
      <div className="mt-4 rounded-2xl bg-primary-foreground/10 p-3" suppressHydrationWarning>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70">
          Availability
        </div>
        <div className="mt-0.5 text-sm font-semibold opacity-70">Loading…</div>
      </div>
    );
  }
  const onShift = status.status === "on_shift";
  return (
    <div className="mt-4 rounded-2xl bg-primary-foreground/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70">
            Availability
          </div>
          <div className="mt-0.5 text-sm font-semibold">
            {onShift ? (
              <>
                On shift <span className="font-normal opacity-80">· automatic</span>
              </>
            ) : status.status === "available" && status.until ? (
              <>
                Available{" "}
                <span className="font-normal opacity-80">
                  · until {formatTimeOfDay(status.until)}
                </span>
              </>
            ) : (
              <>
                Off <span className="font-normal opacity-80">· resting</span>
              </>
            )}
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-2 py-1 text-[10.5px] font-semibold`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${onShift ? "bg-[oklch(0.85_0.14_150)]" : status.status === "available" ? "bg-accent" : "bg-primary-foreground/60"}`}
          />
          {onShift ? "On shift" : status.status === "available" ? "Available" : "Off"}
        </span>
      </div>
      {!onShift && (
        <div className="mt-3">
          <div className="text-[11px] text-primary-foreground/70">
            {status.quiet
              ? `Quiet hours (${QUIET_END_HOUR} AM – ${QUIET_START_HOUR - 12} PM overnight). Rest protected — only an emergency can reach you.`
              : status.restDay
                ? "Rest day. Off by default — opt in only if you'd like to be reached."
                : "Outside your shift. Rest is the default — opt in only if you're okay to be reached."}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {status.status === "available" ? (
              <button
                onClick={onOff}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary-foreground/25"
              >
                Switch to Off
              </button>
            ) : status.quiet ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs font-semibold text-primary-foreground/70">
                Available disabled until {QUIET_END_HOUR}:00 AM
              </span>
            ) : (
              <>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/70">
                  Available for
                </span>
                <button
                  onClick={() => onAvailable(1)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground text-primary px-3 py-1.5 text-xs font-semibold shadow-soft transition hover:bg-primary-foreground/90"
                >
                  1 hour
                </button>
                <button
                  onClick={() => onAvailable(2)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground text-primary px-3 py-1.5 text-xs font-semibold shadow-soft transition hover:bg-primary-foreground/90"
                >
                  2 hours
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
