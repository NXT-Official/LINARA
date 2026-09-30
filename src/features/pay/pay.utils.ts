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

const CUTOFF_DISPLAY = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" });

/**
 * "Aug 1 - Aug 15" from two ISO dates -- local display only, not sent
 * anywhere. Safe under any client timezone: the `T00:00:00` suffix parses as
 * LOCAL midnight and Intl formats in that same local zone, so the day survives
 * the round trip. (It is only mixing the two -- local components in, UTC out --
 * that broke `currentCutoffRange`.)
 */
export function formatCutoffRange(cutoffStart: string, cutoffEnd: string): string {
  const start = CUTOFF_DISPLAY.format(new Date(`${cutoffStart}T00:00:00`));
  const end = CUTOFF_DISPLAY.format(new Date(`${cutoffEnd}T00:00:00`));
  return `${start} – ${end}`;
}
