import { parseISODate } from "@/lib/time";

/**
 * KNOWN_GAPS.md O2's sanity bound on the automatic day rollover. A bigger jump
 * waits for a manager to confirm it on the Pass (StaleDayNotice); there used
 * to be a manual "Start new day" for that, removed 2026-10-02, which left a
 * board more than two weeks behind stuck on its old day (found 2026-10-29).
 */
export const MAX_PLAUSIBLE_ROLLOVER_DAYS = 14;

export type RolloverDecision =
  | { kind: "device_wrong" }
  | { kind: "roll"; days: number }
  | { kind: "too_far"; today: string; days: number };

/** What to do once the server has said which day it is in the household. */
export function rolloverDecision(serverTodayIso: string, boardDayIso: string): RolloverDecision {
  if (serverTodayIso <= boardDayIso) return { kind: "device_wrong" };
  const days = Math.round(
    (parseISODate(serverTodayIso).getTime() - parseISODate(boardDayIso).getTime()) / 86_400_000,
  );
  return days > MAX_PLAUSIBLE_ROLLOVER_DAYS
    ? { kind: "too_far", today: serverTodayIso, days }
    : { kind: "roll", days };
}
