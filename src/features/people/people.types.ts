// People in the household: helpers on stations, admins who manage, and pending invites.

import type { LedgerResolution } from "@/features/ledger/ledger.types";

export type Station = "Yaya" | "Cook" | "Laundry" | "Driver" | "House";

export type PaydayInterval = "semi_monthly" | "monthly";

export type Helper = {
  id: string;
  name: string;
  short: string;
  initials: string;
  station: Station;
  shift: string;
  restDay: string;
  monthlyRate: number;
  paydayInterval: PaydayInterval;
  phone: string;
  /**
   * How this helper's off-shift work is classified by default -- the
   * "flexible per worker" resolution type from home-management-concept.md.
   *
   * `defaultResolution` is the manager's EXPLICIT choice, or null meaning
   * "follow employment". `effectiveResolution` is the answer that actually
   * gets used, derived in Postgres (helper_profiles.effective_resolution, a
   * generated column -- see supabase/add-helper-default-resolution.sql).
   * Read `effectiveResolution`; never re-derive it from employment here, or
   * this becomes a second definition that can drift.
   */
  defaultResolution: LedgerResolution | null;
  effectiveResolution: LedgerResolution;
  /** Her team (household_teams), or null. Labels live in the team store. */
  teamId: string | null;
};

export type AdminType = "primary" | "co" | "remote";
/** A manager's role in one household (household_managers.role). */
export type ManagerRole = "primary_manager" | "co_manager" | "remote_admin";
/** One household this account manages (my_households()). */
export type HouseholdSummary = { id: string; name: string; role: ManagerRole; isCurrent: boolean };
/** One manager of the household you're in (household_manager_roster()). */
export type ManagerMember = {
  userId: string;
  fullName: string;
  role: ManagerRole;
  addedAt: string;
  isYou: boolean;
};
/** An open code for joining this household as a manager. */
export type ManagerInvite = {
  id: string;
  code: string;
  role: Exclude<ManagerRole, "primary_manager">;
  expiresAt: string;
};
export type Admin = {
  id: string;
  name: string;
  short: string;
  initials: string;
  type: AdminType;
  location: string;
};

export type Employment = "live-in" | "live-out";
/** Who keeps the pantry (supabase/add-pantry-roles.sql): "lead" is in charge
 * of stock and the palengke list; "runner" buys what's on the list. Both can
 * say something ran out. */
export type PantryRole = "lead" | "runner";
export type InviteFlag = { id: string; field: string; note?: string; at: number };
export type Invite = {
  id: string;
  code: string;
  name: string;
  station: Station;
  employment: Employment;
  /** Raw "HH:MM"/"HH:MM:SS" as stored in helper_profiles -- the data, for
   * writes and comparisons. Prefer these over parsing `shift`. */
  shiftStart: string;
  shiftEnd: string;
  /** Display-only, already localized ("6:00 AM – 7:00 PM"). Never parse this. */
  shift: string;
  restDay: string;
  wagePHP: number;
  phone: string;
  createdAt: number;
  createdBy: string;
  /** "ended": she worked here and has left (helper_profiles INACTIVE). */
  status: "pending" | "active" | "ended";
  /** Her last working day, for an ended employment ("YYYY-MM-DD"). */
  endedOn?: string;
  /** Her first working day ("YYYY-MM-DD"); the invite date if never set. */
  startedOn?: string;
  /** The last day she gave notice for, from her app, while still employed. */
  noticeLastDay?: string;
  noticeNote?: string;
  claimedName?: string;
  claimedAt?: number;
  /** Unset until add-pantry-roles.sql is applied; People hides the choice then. */
  pantryRole?: PantryRole;
  /** Her team (add-teams-and-labels.sql); null for none. */
  teamId?: string | null;
  flags: InviteFlag[];
};
