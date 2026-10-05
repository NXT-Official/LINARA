import type { HelperProfileRow } from "@/features/people/hooks/use-invites";

import type { PlaceRef, SharedHelperRow } from "./sharing.types";

/**
 * A shared helper as a helper_profiles row, so schedules, availability and
 * the send gate treat her like anyone else here. Pay fields are zero and
 * never shown: this household doesn't pay her (employedHelpers leaves her out).
 */
export function sharedToProfileRow(r: SharedHelperRow): HelperProfileRow {
  return {
    id: r.id,
    name: r.name,
    station: r.station,
    employment: r.employment,
    shift_start: r.shift_start,
    shift_end: r.shift_end,
    weekly_rest_day: r.weekly_rest_day,
    daily_break_duration: 60,
    break_start: r.break_start,
    break_end: r.break_end,
    monthly_rate: 0,
    payday_interval: "semi_monthly",
    phone: null,
    default_resolution: null,
    effective_resolution: null,
    invite_code: null,
    status: "ACTIVE",
    manual_status: r.manual_status,
    manual_available_until: r.manual_available_until,
    team_id: r.team_id,
    created_at: r.created_at,
  };
}

/** The two columns one end of a trip is stored in. */
export function placeColumns(ref: PlaceRef | null | undefined): {
  household: string | null;
  place: string | null;
} {
  if (!ref) return { household: null, place: null };
  return ref.kind === "house"
    ? { household: ref.id, place: null }
    : { household: null, place: ref.id };
}

/** One end of a trip, back from its two columns. */
export function placeFromColumns(
  household: string | null | undefined,
  place: string | null | undefined,
): PlaceRef | undefined {
  if (household) return { kind: "house", id: household };
  if (place) return { kind: "place", id: place };
  return undefined;
}

/** "h:<id>" / "p:<id>" for a <select>, and back. */
export const placeKey = (ref: PlaceRef | undefined) =>
  ref ? `${ref.kind === "house" ? "h" : "p"}:${ref.id}` : "";
export const placeFromKey = (key: string): PlaceRef | undefined =>
  key.startsWith("h:")
    ? { kind: "house", id: key.slice(2) }
    : key.startsWith("p:")
      ? { kind: "place", id: key.slice(2) }
      : undefined;
