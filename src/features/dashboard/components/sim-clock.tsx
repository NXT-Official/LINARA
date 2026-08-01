import { CalendarClock } from "lucide-react";
import { useState } from "react";

import { useMounted } from "@/hooks/use-mounted";
import { formatClock } from "@/lib/time";

export function SimClock({
  nowTs,
  offsetMs,
  onChange,
}: {
  nowTs: number;
  offsetMs: number | null;
  onChange: (v: number | null) => void;
}) {
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  const jumpTo = (opts: {
    dayOffset?: number;
    toSunday?: boolean;
    hour: number;
    minute?: number;
  }) => {
    const base = new Date();
    if (opts.toSunday) {
      const dow = base.getDay();
      const add = (7 - dow) % 7 || 7; // next Sunday (never today)
      base.setDate(base.getDate() + add);
    } else if (opts.dayOffset) {
      base.setDate(base.getDate() + opts.dayOffset);
    }
    base.setHours(opts.hour, opts.minute ?? 0, 0, 0);
    onChange(base.getTime() - Date.now());
    setOpen(false);
  };
  const isSim = offsetMs !== null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-soft transition sm:text-xs ${
          isSim
            ? "border-accent/50 bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]"
            : "border-border bg-card text-muted-foreground"
        }`}
        title="Simulate the clock for demo"
      >
        <CalendarClock className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap tabular-nums" suppressHydrationWarning>
          {mounted ? formatClock(nowTs) : "—"}
        </span>
        {isSim && <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px]">SIM</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-border bg-card p-2 shadow-lift">
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Simulate time
          </div>
          {[
            {
              label: "Real time",
              desc: "Now, live",
              action: () => {
                onChange(null);
                setOpen(false);
              },
            },
            {
              label: "After shift · 7:00 PM",
              desc: "Off-shift auto-off",
              action: () => jumpTo({ hour: 19 }),
            },
            {
              label: "Overnight · 11:00 PM",
              desc: "Quiet hours hard-off",
              action: () => jumpTo({ hour: 23 }),
            },
            {
              label: "Rest day · Sun 10 AM",
              desc: "Off by default all day",
              action: () => jumpTo({ toSunday: true, hour: 10 }),
            },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={opt.action}
              className="flex w-full flex-col items-start rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-secondary/60"
            >
              <span className="font-semibold text-foreground">{opt.label}</span>
              <span className="text-[10.5px] text-muted-foreground">{opt.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
