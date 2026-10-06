import type { AdminType, ManagerRole, Station } from "./people.types";

// Matches helper_profiles.weekly_rest_day's convention (0-6, Sunday = 0) --
// see ARCHITECTURE.md Section 8. Shared by the invite form (name -> index)
// and the roster read path (index -> name).
export const WEEKLY_REST_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

// Regional minimum wage for Metro Manila (Batas Kasambahay)
export const REGIONAL_MINIMUM_WAGE = 6000;

export const adminTypeLabel: Record<AdminType, string> = {
  primary: "Primary manager",
  co: "Co-manager",
  remote: "Remote admin",
};
export const adminTypeShort: Record<AdminType, string> = {
  primary: "Primary",
  co: "Co-manager",
  remote: "Remote",
};
// What each role may do: plan.md 1.2, held by the database
// (supabase/add-household-managers.sql).
export const adminPermSummary: Record<AdminType, string> = {
  primary: "Runs the household, and the only one who adds or removes managers.",
  co: "Manages everything with the primary manager, except who the managers are.",
  remote:
    "Sees everything, pays the helper, and approves vales and the budget. Suggests tasks, or sends one live when it's urgent and the helper is on shift.",
};

// household_managers.role (database) -> AdminType (what the UI is keyed on).
export const managerRoleType: Record<ManagerRole, AdminType> = {
  primary_manager: "primary",
  co_manager: "co",
  remote_admin: "remote",
};

// Station accents: Tailwind pairs for chips, raw hex for lane borders and progress bars.
export const stationTone: Record<Station, string> = {
  Yaya: "bg-terracotta-soft/60 text-pine-deep",
  Cook: "bg-[oklch(0.92_0.05_140)] text-[oklch(0.35_0.08_140)]",
  Laundry: "bg-[oklch(0.92_0.04_240)] text-[oklch(0.35_0.08_240)]",
  Driver: "bg-[oklch(0.92_0.05_60)] text-accent-foreground",
  House: "bg-secondary text-pine-deep",
};

/** Warm grey for a task nobody is assigned to yet. */
export const UNASSIGNED_HEX = { solid: "#9A9387", soft: "rgba(154,147,135,0.16)" };

export const STATION_HEX: Record<Station, { solid: string; soft: string }> = {
  Yaya: { solid: "#E6A98F", soft: "rgba(230,169,143,0.16)" },
  Cook: { solid: "#7FA98C", soft: "rgba(127,169,140,0.18)" },
  Driver: { solid: "#8098B4", soft: "rgba(128,152,180,0.20)" },
  Laundry: { solid: "#8098B4", soft: "rgba(128,152,180,0.20)" },
  House: { solid: "#1F5A54", soft: "rgba(31,90,84,0.14)" },
};
