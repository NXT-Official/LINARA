import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import type { RosaStatus } from "@/features/availability/availability.types";
import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";
import { isRestDay } from "@/features/shifts/shift.utils";
import type { CompletionRecord } from "@/features/tasks/hooks/use-task-board";
import { parseHM, weekdayOf } from "@/lib/time";

import {
  insertLedgerEntryFn,
  listLedgerEntriesFn,
  RESOLUTION_TYPE_TO_RESOLUTION,
  setHelperDefaultResolutionFn,
  SOURCE_TYPE_TO_REASON,
  updateLedgerEntryFn,
  type LedgerEntryRow,
} from "../ledger.actions";
import type { LedgerEntry, LedgerReason, LedgerResolution } from "../ledger.types";

export type LedgerStore = ReturnType<typeof useLedger>;

function toLedgerEntry(row: LedgerEntryRow): LedgerEntry {
  const doneTs = new Date(row.created_at).getTime();
  const autoMinutes = row.duration_minutes;
  return {
    id: row.id,
    helperId: row.helper_id,
    sourceId: row.id,
    kind: row.kind === "utos" ? "utos" : "task",
    title: row.title,
    startTs: doneTs - autoMinutes * 60_000,
    doneTs,
    autoMinutes,
    adjustMinutes: row.adjust_minutes,
    resolution: RESOLUTION_TYPE_TO_RESOLUTION[row.resolution_type ?? ""] ?? "rest",
    reason: SOURCE_TYPE_TO_REASON[row.source_type] ?? "override",
  };
}

/**
 * Off-shift work owed back, as time in lieu or rest-day premium.
 *
 * Both sides read the same numbers. On-shift work never lands here — `record`
 * drops anything the current helper did during her own shift and classifies
 * the rest against her real schedule (rest day, rest break, emergency, or a
 * plain override). Real Supabase-backed as of KNOWN_GAPS.md gap #5's Ledger
 * half — `record`/`updateEntry` write through to `ledger_entries` and
 * refetch, same pattern as useVales.
 */
export function useLedger({
  rosaStatus,
  schedules,
  currentHelperId,
  token,
  ready,
}: {
  rosaStatus: RosaStatus;
  schedules: ScheduleStore;
  /** Real helper_profiles id of the one helper with a first-class device -- null
   * until a real helper has claimed their account (see app-store-provider.tsx). */
  currentHelperId: string | null;
  token: string | null;
  ready: boolean;
}) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const rows = await listLedgerEntriesFn({ data: { token } });
    setEntries(rows.map(toLedgerEntry));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => {
      console.error("[useLedger] Failed to load ledger entries:", err);
    });
  }, [ready, token, refresh]);

  const classify = (ts: number, emergency: boolean): LedgerReason => {
    if (emergency) return "emergency";
    const d = new Date(ts);
    const schedule = currentHelperId ? schedules.scheduleFor(currentHelperId) : undefined;
    if (schedule && isRestDay(weekdayOf(d), schedule)) return "rest_day";
    if (schedule?.breakStart && schedule?.breakEnd) {
      const minutes = d.getHours() * 60 + d.getMinutes();
      if (minutes >= parseHM(schedule.breakStart) && minutes < parseHM(schedule.breakEnd)) {
        return "rest_break";
      }
    }
    if (rosaStatus.status === "available") return "available";
    return "override";
  };

  /** Called for every completion; only off-shift work by the current helper is recorded. */
  const record = (completion: CompletionRecord) => {
    if (!token || !currentHelperId || completion.helperId !== currentHelperId) return;
    const isOffShift = rosaStatus.status !== "on_shift";
    const isExplicitAfterHours = completion.afterHours || completion.emergency;

    if (!isOffShift && !isExplicitAfterHours) return;

    // `resolution` is deliberately NOT passed: Postgres classifies the entry
    // from this helper's own default (Session E / E2). It used to come from a
    // household-wide useState in this hook, so the last person to touch a
    // shared toggle decided how a DIFFERENT helper's off-shift work was
    // recorded. See supabase/add-helper-default-resolution.sql.
    insertLedgerEntryFn({
      data: {
        token,
        helperId: currentHelperId,
        title: completion.title,
        kind: completion.kind,
        reason: classify(completion.doneTs, completion.emergency),
        autoMinutes: completion.autoMinutes,
        doneTsIso: new Date(completion.doneTs).toISOString(),
      },
    })
      .then(() => refresh())
      .catch((err) => {
        console.error("[useLedger] Failed to record ledger entry:", err);
        toast.error("Hindi na-save ang ledger entry.");
      });
  };

  const updateEntry = (
    id: string,
    patch: Partial<Pick<LedgerEntry, "adjustMinutes" | "resolution">>,
  ) => {
    if (!token) return;
    updateLedgerEntryFn({
      data: {
        token,
        entryId: id,
        adjustMinutes: patch.adjustMinutes,
        resolution: patch.resolution,
      },
    })
      .then(() => refresh())
      .catch((err) => {
        console.error("[useLedger] Failed to update ledger entry:", err);
        toast.error("Hindi na-save ang pagbabago sa ledger entry.");
      });
  };

  /**
   * Sets the SELECTED helper's own default. Returns the effective value so the
   * caller can refresh its helper list -- the derived answer lives in Postgres
   * (a generated column), so the client must be told it rather than compute it.
   */
  const setHelperDefault = async (helperId: string, resolution: LedgerResolution | null) => {
    if (!token) return null;
    try {
      return await setHelperDefaultResolutionFn({ data: { token, helperId, resolution } });
    } catch (err) {
      console.error("[useLedger] Failed to set the helper's resolution default:", err);
      toast.error("Hindi na-save ang default para sa helper na ito.");
      return null;
    }
  };

  return {
    entries,
    record,
    updateEntry,
    setHelperDefault,
    refresh,
  };
}
