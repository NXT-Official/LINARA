import { AlertCircle, CalendarClock } from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar } from "@/components/shared/avatar";
import { HELPERS } from "@/features/people/people.constants";
import { WEEKDAY_LONG, WEEKDAYS, type Weekday } from "@/lib/time";

import type { ScheduleStore } from "../hooks/use-schedules";
import { DayEditor } from "./day-editor";

/** Weekly pattern per helper, with a warning when a weekday has no cover. */
export function ShiftsSection({
  schedules,
  readOnly = false,
}: {
  schedules: ScheduleStore;
  readOnly?: boolean;
}) {
  const { byHelper, updateDay: onUpdate } = schedules;
  const [editing, setEditing] = useState<{ helperId: string; day: Weekday } | null>(null);

  // Coverage warnings: any weekday where 2+ helpers are on rest.
  const restByDay = useMemo(() => {
    const map: Record<Weekday, string[]> = {
      Mon: [],
      Tue: [],
      Wed: [],
      Thu: [],
      Fri: [],
      Sat: [],
      Sun: [],
    };
    for (const h of HELPERS) {
      const wk = byHelper[h.id];
      if (!wk) continue;
      for (const d of WEEKDAYS) if (wk[d].rest) map[d].push(h.short);
    }
    return map;
  }, [byHelper]);
  const warnings = WEEKDAYS.map((d) => ({ day: d, offs: restByDay[d] })).filter(
    (w) => w.offs.length >= 2,
  );

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-foreground">Shifts</h2>
          <p className="text-xs text-muted-foreground">
            Weekly pattern per helper. Tap a day to edit hours or break.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep">
          <CalendarClock className="h-3 w-3" /> {HELPERS.length} helpers
        </span>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {warnings.map((w) => (
            <div
              key={w.day}
              className="flex items-start gap-2 rounded-2xl border border-terracotta/40 bg-terracotta-soft/50 px-3 py-2 text-xs text-[oklch(0.38_0.09_60)]"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-semibold">No one covers {WEEKDAY_LONG[w.day]}</span> —{" "}
                {w.offs.join(" & ")} both off.
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {HELPERS.map((h) => {
          const wk = byHelper[h.id];
          if (!wk) return null;
          const restLabel =
            WEEKDAYS.filter((d) => wk[d].rest)
              .map((d) => WEEKDAY_LONG[d])
              .join(", ") || "None";
          return (
            <div key={h.id} className="rounded-2xl border border-border/70 bg-background/40 p-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Avatar initials={h.initials} />
                  <div>
                    <div className="text-sm font-semibold text-foreground">{h.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {h.station} · Rest: {restLabel}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map((d) => {
                  const day = wk[d];
                  const isEditing = editing?.helperId === h.id && editing.day === d;
                  return (
                    <button
                      key={d}
                      disabled={readOnly}
                      onClick={() => setEditing(isEditing ? null : { helperId: h.id, day: d })}
                      className={`flex flex-col items-center rounded-xl border px-1 py-1.5 text-[10px] transition ${
                        isEditing
                          ? "border-primary bg-primary/10 text-primary"
                          : day.rest
                            ? "border-border/60 bg-secondary/50 text-muted-foreground"
                            : "border-border/70 bg-card text-foreground hover:border-primary/40"
                      } ${readOnly ? "cursor-default opacity-95" : ""}`}
                    >
                      <span className="font-semibold uppercase tracking-wider">{d}</span>
                      <span className="mt-0.5 leading-tight">
                        {day.rest ? "Rest" : day.segments.map((s) => `${s.start}`).join("/") || "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className={
                      editing?.helperId === h.id && editing.day === d ? "hidden" : "hidden"
                    }
                  />
                ))}
                {editing && editing.helperId === h.id ? null : (
                  <span>{readOnly ? "Remote admin — read-only view." : "Tap a day to edit."}</span>
                )}
              </div>
              {editing && editing.helperId === h.id && (
                <DayEditor
                  key={editing.day}
                  day={editing.day}
                  value={wk[editing.day]}
                  onChange={(patch) => onUpdate(h.id, editing.day, patch)}
                  onClose={() => setEditing(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
