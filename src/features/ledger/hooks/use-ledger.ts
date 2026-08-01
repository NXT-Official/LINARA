import { useState } from "react";

import type { RosaStatus } from "@/features/availability/availability.types";
import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";
import type { CompletionRecord } from "@/features/tasks/hooks/use-task-board";
import { parseHM, weekdayOf } from "@/lib/time";

import type { LedgerEntry, LedgerReason, LedgerResolution } from "../ledger.types";

export type LedgerStore = ReturnType<typeof useLedger>;

/**
 * Off-shift work owed back, as time in lieu or rest-day premium.
 *
 * Both sides read the same numbers. On-shift work never lands here — `record`
 * drops anything Rosa did during her own shift and classifies the rest against
 * her real schedule (rest day, rest break, emergency, or a plain override).
 */
export function useLedger({
  rosaStatus,
  schedules,
}: {
  rosaStatus: RosaStatus;
  schedules: ScheduleStore;
}) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [resolutionDefault, setResolutionDefault] = useState<LedgerResolution>("rest");

  const classify = (ts: number, emergency: boolean): LedgerReason => {
    if (emergency) return "emergency";
    const d = new Date(ts);
    const day = schedules.weekFor("rosa")[weekdayOf(d)];
    if (day.rest) return "rest_day";
    const minutes = d.getHours() * 60 + d.getMinutes();
    if (
      day.breakStart &&
      day.breakEnd &&
      minutes >= parseHM(day.breakStart) &&
      minutes < parseHM(day.breakEnd)
    ) {
      return "rest_break";
    }
    if (rosaStatus.status === "available") return "available";
    return "override";
  };

  /** Called for every completion; only off-shift work by Rosa is recorded. */
  const record = (completion: CompletionRecord) => {
    if (completion.helperId !== "rosa" || rosaStatus.status === "on_shift") return;
    const { emergency, helperId: _helperId, ...rest } = completion;
    setEntries((prev) => [
      ...prev,
      {
        ...rest,
        id: `l${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        adjustMinutes: 0,
        resolution: resolutionDefault,
        reason: classify(completion.doneTs, emergency),
      },
    ]);
  };

  return {
    entries,
    resolutionDefault,
    setResolutionDefault,
    record,
    updateEntry: (id: string, patch: Partial<Pick<LedgerEntry, "adjustMinutes" | "resolution">>) =>
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e))),
  };
}
