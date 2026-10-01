// Time a helper has off beyond her weekly rest day. Today that's rest off
// (rest_off_requests: one date and a window, redeemed from rest owed); leave
// (LEAVE_PLAN.md) will arrive as more of the same shape, so the planner,
// availability and the gate only ever read TimeOff.
import type { RestOffRequestRow } from "@/features/ledger/rest-off.actions";
import { formatDisplayTime, parseHM } from "@/lib/time";

export type TimeOff = {
  id: string;
  helperId: string;
  /** YYYY-MM-DD, the household's date. */
  date: string;
  /** Minutes after midnight, half-open [startMin, endMin). */
  startMin: number;
  endMin: number;
  /** Pending is shown as asked for; only approved time off counts as off. */
  status: "approved" | "pending";
};

/** Live rest-off requests as time off: declined and cancelled ones are history, not time off. */
export function timeOffFromRestOff(rows: RestOffRequestRow[]): TimeOff[] {
  return rows
    .filter(
      (r): r is RestOffRequestRow & { status: TimeOff["status"] } =>
        r.status === "approved" || r.status === "pending",
    )
    .map((r) => ({
      id: r.id,
      helperId: r.helper_id,
      date: r.rest_date,
      // Postgres TIME reads back as "13:00:00" (C34); parseHM takes the first two parts.
      startMin: parseHM(r.start_time),
      endMin: parseHM(r.end_time),
      status: r.status,
    }));
}

/** Her approved time off covering this minute of this day, if any. */
export const approvedTimeOffAt = (
  list: TimeOff[],
  helperId: string,
  dayIso: string,
  minute: number,
): TimeOff | undefined =>
  list.find(
    (o) =>
      o.status === "approved" &&
      o.helperId === helperId &&
      o.date === dayIso &&
      minute >= o.startMin &&
      minute < o.endMin,
  );

/** Every time off on a day, earliest first. */
export const timeOffOn = (list: TimeOff[], dayIso: string): TimeOff[] =>
  list.filter((o) => o.date === dayIso).sort((a, b) => a.startMin - b.startMin);

/** "1:00 PM – 5:00 PM". */
export const timeOffWindow = (o: TimeOff): string =>
  `${formatDisplayTime(o.startMin)} – ${formatDisplayTime(o.endMin)}`;
