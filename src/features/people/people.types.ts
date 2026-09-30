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
};

export type AdminType = "primary" | "co" | "remote";
export type Admin = {
  id: string;
  name: string;
  short: string;
  initials: string;
  type: AdminType;
  location: string;
};

export type Employment = "live-in" | "live-out";
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
  status: "pending" | "active";
  claimedName?: string;
  claimedAt?: number;
  flags: InviteFlag[];
};
