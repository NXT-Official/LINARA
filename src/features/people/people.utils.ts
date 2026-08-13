import type { HelperProfileRow } from "./hooks/use-invites";
import { WEEKLY_REST_DAY_NAMES } from "./people.constants";
import type { Helper, Station } from "./people.types";
import { fmtHM12 } from "@/lib/time";

// "Ate Marites" -> "AM". Used for invited helpers, who have no seeded initials yet.
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "??";

// "Ate Rosa" -> "Rosa", "Kuya Manuel" -> "Manuel" -- drops a leading honorific by
// taking the last token; a bare one-word name passes through unchanged.
const shortNameOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? name;
};

/** Maps a real helper_profiles row (see use-invites.ts) onto the display-shaped Helper type. */
export function toHelper(row: HelperProfileRow): Helper {
  return {
    id: row.id,
    name: row.name,
    short: shortNameOf(row.name),
    initials: initialsOf(row.name),
    station: row.station as Station,
    shift: `${fmtHM12(row.shift_start)} – ${fmtHM12(row.shift_end)}`,
    restDay: WEEKLY_REST_DAY_NAMES[row.weekly_rest_day] ?? "Sunday",
  };
}

/** Placeholder shown when a task/vale/etc. references a helper id that no longer resolves
 * (e.g. a deleted profile, or a stale local id from before real data loaded). */
export const UNKNOWN_HELPER: Helper = {
  id: "",
  name: "Unknown helper",
  short: "Unknown",
  initials: "??",
  station: "House",
  shift: "",
  restDay: "",
};

export const findHelper = (id: string, helpers: Helper[]): Helper =>
  helpers.find((h) => h.id === id) ?? UNKNOWN_HELPER;
