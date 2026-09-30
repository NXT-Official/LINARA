import { RESOLUTION_TYPE_TO_RESOLUTION } from "@/features/ledger/ledger.utils";

import type { HelperProfileRow } from "./hooks/use-invites";
import { WEEKLY_REST_DAY_NAMES } from "./people.constants";
import type { Helper, PaydayInterval, Station } from "./people.types";
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
    monthlyRate: Number(row.monthly_rate),
    paydayInterval: row.payday_interval,
    phone: row.phone ?? "",
    // Postgres decides both of these (supabase/add-helper-default-resolution.sql).
    // effective_resolution is a generated column; the `?? "rest"` is only for a
    // client running against a database where the migration hasn't been applied
    // yet -- it must never become a place the rule is re-implemented.
    defaultResolution: RESOLUTION_TYPE_TO_RESOLUTION[row.default_resolution ?? ""] ?? null,
    effectiveResolution: RESOLUTION_TYPE_TO_RESOLUTION[row.effective_resolution ?? ""] ?? "rest",
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
  monthlyRate: 0,
  paydayInterval: "semi_monthly",
  phone: "",
  defaultResolution: null,
  effectiveResolution: "rest",
};

export interface StatutorySplit {
  isUnder5k: boolean;
  sssEmployer: number;
  sssEmployee: number;
  philhealthEmployer: number;
  philhealthEmployee: number;
  pagibigEmployer: number;
  pagibigEmployee: number;
  totalEmployer: number;
  totalEmployee: number;
}

/**
 * Batas Kasambahay's monthly statutory split. Single source of truth for
 * both `LegalContributionSplitCard` (a not-yet-hired invite's preview,
 * against `Invite.wagePHP`) and `SpendAndPayday`'s Pay Dial (a real active
 * helper's accrued cutoff, against `Helper.monthlyRate` -- see
 * KNOWN_GAPS.md Closed Gap C16), so the two can't drift the way the flat
 * ₱240 hardcode once did against this exact formula. Ported from
 * LINARA_MOBILE's `computeStatutorySplit`
 * (components/features/pay/legal-contribution-split.tsx), which already
 * proved this out for the mobile Pay tab.
 */
export function computeStatutorySplit(wagePHP: number): StatutorySplit {
  const isUnder5k = wagePHP < 5000;

  const sssEmployer = isUnder5k ? 400 : 350;
  const sssEmployee = isUnder5k ? 0 : 150;

  const philhealthEmployer = isUnder5k ? 150 : 125;
  const philhealthEmployee = isUnder5k ? 0 : 125;

  const pagibigEmployer = 100;
  const pagibigEmployee = isUnder5k ? 0 : 100;

  return {
    isUnder5k,
    sssEmployer,
    sssEmployee,
    philhealthEmployer,
    philhealthEmployee,
    pagibigEmployer,
    pagibigEmployee,
    totalEmployer: sssEmployer + philhealthEmployer + pagibigEmployer,
    totalEmployee: sssEmployee + philhealthEmployee + pagibigEmployee,
  };
}

/** Cutoffs per month for a payday interval -- semi_monthly splits base pay
 * and statutory deductions in half per cutoff, monthly doesn't. */
export function cutoffsPerMonth(interval: PaydayInterval): 1 | 2 {
  return interval === "monthly" ? 1 : 2;
}

export const findHelper = (id: string, helpers: Helper[]): Helper =>
  helpers.find((h) => h.id === id) ?? UNKNOWN_HELPER;
