/**
 * Cutoff DISPLAY only. The cutoff boundaries themselves are derived in
 * Postgres now -- `public.household_cutoff()` in
 * supabase/add-household-timezone-and-cutoffs.sql -- and read through
 * `getHouseholdCutoffFn`.
 *
 * The old `currentCutoffRange()` lived here and was deleted in Session B
 * (PAYMENTS_REMEDIATION.md). It built a Date from LOCAL components and then
 * formatted it with toISOString() (UTC), which shifted every boundary back a
 * day in Asia/Manila, truncated month-end (a 31-day August ended 08-30, so the
 * 31st belonged to no cutoff at all), and -- because the day-of-month
 * comparison that picks the half was itself timezone-dependent -- could select
 * the wrong half outright near a boundary. Worse, it ran on BOTH the server
 * (which wrote cutoff_start/cutoff_end) and the browser (which looked the
 * current cutoff up), so the two disagreed and the Pay button never became a
 * status badge after a successful payout.
 *
 * Do not reintroduce a client-side cutoff derivation. A calendar day that gets
 * persisted or compared is computed in Postgres, in the household's timezone.
 */

// Pinned to UTC on purpose. An Intl formatter fixes its time zone when it is
// built, at module load, while `new Date(...)` reads the zone each time it
// parses. Parsing in local time and formatting in the zone captured at load
// shifts the day whenever the two differ: CI (UTC) running the Asia/Manila
// case printed "Jul 31 - Aug 14". UTC on both sides is the same in every zone.
const CUTOFF_DISPLAY = new Intl.DateTimeFormat("en-PH", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/**
 * "Aug 1 - Aug 15" from two ISO dates -- display only, not sent anywhere.
 * Safe under any client timezone: each date parses as UTC midnight (`Z`) and
 * is formatted in UTC, so the day survives the round trip. (It is only mixing
 * the two zones that breaks the day, as `currentCutoffRange` did.)
 */
export function formatCutoffRange(cutoffStart: string, cutoffEnd: string): string {
  const start = CUTOFF_DISPLAY.format(new Date(`${cutoffStart}T00:00:00Z`));
  const end = CUTOFF_DISPLAY.format(new Date(`${cutoffEnd}T00:00:00Z`));
  return `${start} – ${end}`;
}
