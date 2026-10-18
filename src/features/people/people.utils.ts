import { RESOLUTION_TYPE_TO_RESOLUTION } from "@/features/ledger/ledger.utils";

import type { HelperProfileRow } from "./hooks/use-invites";
import { WEEKLY_REST_DAY_NAMES } from "./people.constants";
import type { Helper, PaydayInterval, Station } from "./people.types";
import { fmtHM12 } from "@/lib/time";

// Titles a household puts before a name ("Ate Marites", "Kuya Marito",
// "Manang Rosa"). Dropped before shortening, so the short name and initials
// are the person's own, not the title's.
const HONORIFICS = new Set([
  "ate",
  "kuya",
  "manang",
  "manong",
  "nanay",
  "tatay",
  "lola",
  "lolo",
  "tita",
  "tito",
  "ninang",
  "ninong",
  "yaya",
  "aling",
  "mang",
  "ms",
  "mr",
  "mrs",
  "miss",
  "sir",
  "maam",
  "ma'am",
]);

/** The words of a name without a leading title; a title alone is kept. */
const givenNames = (name: string): string[] => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.toLowerCase().replace(/\.$/, "");
  return parts.length > 1 && first && HONORIFICS.has(first) ? parts.slice(1) : parts;
};

// "Ate Marites" -> "M", "Nicole Azachee" -> "NA".
export const initialsOf = (name: string): string =>
  givenNames(name)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("") || "??";

// "Ate Rosa" -> "Rosa", "Kuya Manuel" -> "Manuel", "Nicole Azachee" -> "Nicole".
// "Ma." is Maria, and a "Ma. Theresa" goes by Theresa.
export const shortNameOf = (name: string): string => {
  const given = givenNames(name);
  return (/^ma\.$/i.test(given[0] ?? "") ? given[1] : given[0]) ?? name.trim();
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
    teamId: row.team_id ?? null,
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
  teamId: null,
};

/** A task nobody is assigned to yet (tickets.helper_id NULL). */
export const UNASSIGNED_HELPER: Helper = {
  ...UNKNOWN_HELPER,
  name: "Unassigned",
  short: "Unassigned",
  initials: "?",
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
  const wage = Math.max(0, wagePHP);
  const isUnder5k = wage < 5000;
  const centavos = (n: number) => Math.round(n * 100) / 100;

  // SSS: 15% of the monthly salary credit (the wage in PHP 500 brackets,
  // 5,000 to 35,000): 5% hers, 10% the employer's, who also pays EC
  // (PHP 10, or 30 from an MSC of 15,000).
  const msc = Math.min(35000, Math.max(5000, 500 * Math.floor((wage + 250) / 500)));
  const sssShare = (msc * 5) / 100;
  const ec = msc < 15000 ? 10 : 30;

  // PhilHealth: 5% of the wage, floored at 10,000 and capped at 100,000,
  // split equally.
  const philhealthShare = centavos(Math.min(100000, Math.max(10000, wage)) / 40);

  // Pag-IBIG: 2% each of the wage up to 10,000 (1% hers at 1,500 or less).
  const pagibigBase = Math.min(10000, wage);
  const pagibigOwn = centavos((pagibigBase * (wage <= 1500 ? 1 : 2)) / 100);
  const pagibigMatch = centavos((pagibigBase * 2) / 100);

  // RA 10361: below PHP 5,000 a month the employer pays her shares as well.
  const sssEmployee = isUnder5k ? 0 : sssShare;
  const sssEmployer = sssShare * 2 + ec + (isUnder5k ? sssShare : 0);
  const philhealthEmployee = isUnder5k ? 0 : philhealthShare;
  const philhealthEmployer = philhealthShare + (isUnder5k ? philhealthShare : 0);
  const pagibigEmployee = isUnder5k ? 0 : pagibigOwn;
  const pagibigEmployer = pagibigMatch + (isUnder5k ? pagibigOwn : 0);

  return {
    isUnder5k,
    sssEmployer,
    sssEmployee,
    philhealthEmployer,
    philhealthEmployee,
    pagibigEmployer,
    pagibigEmployee,
    totalEmployer: centavos(sssEmployer + philhealthEmployer + pagibigEmployer),
    totalEmployee: centavos(sssEmployee + philhealthEmployee + pagibigEmployee),
  };
}

/** Cutoffs per month for a payday interval -- semi_monthly splits base pay
 * and statutory deductions in half per cutoff, monthly doesn't. */
export function cutoffsPerMonth(interval: PaydayInterval): 1 | 2 {
  return interval === "monthly" ? 1 : 2;
}

export const findHelper = (id: string | null, helpers: Helper[]): Helper =>
  id === null ? UNASSIGNED_HELPER : (helpers.find((h) => h.id === id) ?? UNKNOWN_HELPER);

// Renew the access token this long before it runs out (it lasts about an hour).
export const RENEW_MARGIN_MS = 5 * 60_000;

/** A JWT's issued-at and expiry in ms, or null when it can't be read. */
export function jwtTimes(jwt: string): { iat: number; exp: number } | null {
  try {
    const part = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { iat, exp } = JSON.parse(atob(part)) as { iat?: unknown; exp?: unknown };
    if (typeof iat !== "number" || typeof exp !== "number" || exp <= iat) return null;
    return { iat: iat * 1000, exp: exp * 1000 };
  } catch {
    return null;
  }
}

/**
 * How long until `jwt` should be renewed (0: now), or null when it can't be
 * read. A device clock that disagrees with the token (already "expired", or
 * more time left than it ever had) falls back to the token's own lifetime;
 * otherwise a clock set ahead would renew nonstop.
 */
export function msUntilRenewal(jwt: string, now = Date.now()): number | null {
  const times = jwtTimes(jwt);
  if (!times) return null;
  const lifetime = times.exp - times.iat;
  const left = times.exp - now;
  return Math.max(0, (left > 0 && left <= lifetime ? left : lifetime) - RENEW_MARGIN_MS);
}

/** Whether `jwt` has run out, or nearly, by this device's clock (an unreadable one counts). */
export function isDueForRenewal(jwt: string, now = Date.now()): boolean {
  const times = jwtTimes(jwt);
  return !times || times.exp - now < RENEW_MARGIN_MS;
}
