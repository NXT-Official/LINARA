// Shared staff and places (supabase/add-shared-staff-and-places.sql,
// KNOWN_GAPS.md O39). A family runs several households and shares its staff
// between them: one employer (her home household), several workplaces.

/** One end of a trip: one of the family's houses, or a saved place. */
export type PlaceRef = { kind: "house"; id: string } | { kind: "place"; id: string };

/** A household's saved place: School, Office, Lola's. */
export type SavedPlace = { id: string; name: string };

/** A household of the same family (run by someone in common). */
export type FamilyHouse = { id: string; name: string };

/** Someone employed elsewhere in the family who also works here (shared_helpers()). No pay. */
export type SharedHelperRow = {
  id: string;
  name: string;
  station: string;
  employment: "live-in" | "live-out" | null;
  shift_start: string;
  shift_end: string;
  break_start: string | null;
  break_end: string | null;
  weekly_rest_day: number;
  manual_status: "available" | "off" | null;
  manual_available_until: string | null;
  /** Her team in THIS household. */
  team_id: string | null;
  home_household_id: string;
  home_household_name: string;
  created_at: string;
};
