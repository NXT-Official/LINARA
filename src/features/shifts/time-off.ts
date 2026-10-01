// Time a helper has off beyond her weekly rest day: rest off
// (rest_off_requests: one date and a window, redeemed from rest owed) and
// leave (leave_requests: whole days, LEAVE_PLAN.md). The planner, availability
// and the gate only ever read TimeOff, so they treat both the same.
import { LEAVE_ASKED, LEAVE_ON } from "@/features/leave/leave.constants";
import type { LeaveKind, LeaveRequest } from "@/features/leave/leave.types";
import type { RestOffRequestRow } from "@/features/ledger/rest-off.actions";
import { formatDisplayTime, parseHM, parseISODate, toISODate } from "@/lib/time";

export type TimeOff = {
  /** Unique per day: a leave of several days is one entry per day. */
  id: string;
  helperId: string;
  /** YYYY-MM-DD, the household's date. */
  date: string;
  /** Minutes after midnight, half-open [startMin, endMin). A day of leave is 0 to 1440. */
  startMin: number;
  endMin: number;
  /** Pending is shown as asked for; only approved time off counts as off. */
  status: "approved" | "pending";
  kind: "rest_off" | LeaveKind;
};

const live = (status: string): status is TimeOff["status"] =>
  status === "approved" || status === "pending";

/** Live rest-off requests as time off: declined and cancelled ones are history, not time off. */
export function timeOffFromRestOff(rows: RestOffRequestRow[]): TimeOff[] {
  return rows.flatMap((r) =>
    live(r.status)
      ? [
          {
            id: r.id,
            helperId: r.helper_id,
            date: r.rest_date,
            // Postgres TIME reads back as "13:00:00" (C34); parseHM takes the first two parts.
            startMin: parseHM(r.start_time),
            endMin: parseHM(r.end_time),
            status: r.status,
            kind: "rest_off" as const,
          },
        ]
      : [],
  );
}

/** Live leave as one whole-day time off per date it covers. */
export function timeOffFromLeave(rows: LeaveRequest[]): TimeOff[] {
  return rows.flatMap((l) => {
    if (!live(l.status)) return [];
    const status = l.status;
    const out: TimeOff[] = [];
    const end = parseISODate(l.endDate);
    for (let d = parseISODate(l.startDate); d <= end; d.setDate(d.getDate() + 1)) {
      const date = toISODate(d);
      out.push({
        id: `${l.id}:${date}`,
        helperId: l.helperId,
        date,
        startMin: 0,
        endMin: 24 * 60,
        status,
        kind: l.kind,
      });
    }
    return out;
  });
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

/**
 * "Rosa off 1:00 PM – 5:00 PM", "Rosa asked for unpaid leave". Without a name
 * (By person, where the row says whose), it starts with a capital instead.
 */
export function describeTimeOff(o: TimeOff, name?: string): string {
  const approved = o.status === "approved";
  const what =
    o.kind === "rest_off"
      ? `${approved ? "off" : "asked off"} ${timeOffWindow(o)}`
      : approved
        ? LEAVE_ON[o.kind]
        : LEAVE_ASKED[o.kind];
  return name ? `${name} ${what}` : what.charAt(0).toUpperCase() + what.slice(1);
}
