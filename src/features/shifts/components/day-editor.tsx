import { Plus, Trash2, X } from "lucide-react";

import { WEEKDAY_LONG, type Weekday } from "@/lib/time";

import type { DaySchedule, ShiftSegment } from "../shift.types";
import { summarizeDay } from "../shift.utils";

export function DayEditor({
  day,
  value,
  onChange,
  onClose,
}: {
  day: Weekday;
  value: DaySchedule;
  onChange: (patch: Partial<DaySchedule>) => void;
  onClose: () => void;
}) {
  const toggleRest = () => {
    if (value.rest) {
      onChange({ rest: false, segments: [{ start: "08:00", end: "17:00" }] });
    } else {
      onChange({ rest: true, segments: [] });
    }
  };
  const updateSeg = (idx: number, patch: Partial<ShiftSegment>) => {
    const next = value.segments.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange({ segments: next });
  };
  const addSegment = () =>
    onChange({ segments: [...value.segments, { start: "14:00", end: "18:00" }] });
  const removeSegment = (idx: number) =>
    onChange({ segments: value.segments.filter((_, i) => i !== idx) });

  return (
    <div className="mt-3 rounded-2xl border border-primary/30 bg-secondary/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-pine-deep">{WEEKDAY_LONG[day]}</div>
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-pine-deep">
            <input
              type="checkbox"
              checked={value.rest}
              onChange={toggleRest}
              className="h-3.5 w-3.5 accent-current"
            />
            Rest day
          </label>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-card"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {!value.rest && (
        <div className="space-y-2">
          {value.segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="time"
                value={seg.start}
                onChange={(e) => updateSeg(i, { start: e.target.value })}
                className="w-full rounded-lg border border-input bg-card px-2 py-1 text-xs"
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="time"
                value={seg.end}
                onChange={(e) => updateSeg(i, { end: e.target.value })}
                className="w-full rounded-lg border border-input bg-card px-2 py-1 text-xs"
              />
              {value.segments.length > 1 && (
                <button
                  onClick={() => removeSegment(i)}
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addSegment}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5"
          >
            <Plus className="h-3 w-3" /> Split shift
          </button>
          <div className="mt-3 border-t border-border/60 pt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Daily rest break
            </div>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={value.breakStart ?? ""}
                onChange={(e) => onChange({ breakStart: e.target.value || undefined })}
                className="w-full rounded-lg border border-input bg-card px-2 py-1 text-xs"
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="time"
                value={value.breakEnd ?? ""}
                onChange={(e) => onChange({ breakEnd: e.target.value || undefined })}
                className="w-full rounded-lg border border-input bg-card px-2 py-1 text-xs"
              />
              {(value.breakStart || value.breakEnd) && (
                <button
                  onClick={() => onChange({ breakStart: undefined, breakEnd: undefined })}
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Summary: {summarizeDay(value)}</p>
        </div>
      )}
    </div>
  );
}
