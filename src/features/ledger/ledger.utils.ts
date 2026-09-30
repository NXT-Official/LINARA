import type { LedgerEntry, LedgerReason, LedgerResolution } from "./ledger.types";

/**
 * Wire value <-> display value for a resolution. These live HERE, in the pure
 * module, rather than in ledger.actions.ts: people.utils.ts needs them to map
 * helper_profiles.effective_resolution (Session E / E2), and importing them
 * from the actions module dragged `createAuthedClient` -- and therefore a
 * Supabase client constructed at import time -- into every consumer, which
 * broke net-pay.test.ts with "supabaseUrl is required".
 */
export const RESOLUTION_TO_RESOLUTION_TYPE: Record<LedgerResolution, "rest_owed" | "premium_pay"> =
  {
    rest: "rest_owed",
    premium: "premium_pay",
  };

export const RESOLUTION_TYPE_TO_RESOLUTION: Record<string, LedgerResolution> = {
  rest_owed: "rest",
  premium_pay: "premium",
};

export function ledgerEntryMinutes(e: LedgerEntry) {
  return Math.max(0, e.autoMinutes + e.adjustMinutes);
}

export function reasonLabel(r: LedgerReason) {
  if (r === "available")
    return { label: "Available", cls: "bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]" };
  if (r === "emergency")
    return { label: "Emergency", cls: "bg-[oklch(0.95_0.06_35)] text-[oklch(0.42_0.15_30)]" };
  if (r === "rest_day")
    return { label: "Rest day", cls: "bg-[oklch(0.94_0.08_30)] text-[oklch(0.38_0.15_25)]" };
  if (r === "rest_break")
    return { label: "Rest break", cls: "bg-[oklch(0.93_0.05_40)] text-[oklch(0.42_0.12_35)]" };
  return { label: "After shift", cls: "bg-secondary text-pine-deep" };
}

export function fmtHoursMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
