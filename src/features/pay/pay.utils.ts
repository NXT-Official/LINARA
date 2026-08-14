import type { PaydayInterval } from "@/features/people/people.types";

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Philippine semi-monthly cutoffs are conventionally the 1st-15th and the
 * 16th-end of month; "monthly" is the whole month. No `cutoffs` calendar
 * table exists (or is needed) -- this is a pure function of today's date and
 * the helper's `payday_interval`, matching how SpendAndPayday/DigitalPayslip
 * already derive "this cutoff" live rather than from a stored schedule.
 */
export function currentCutoffRange(
  now: Date,
  interval: PaydayInterval,
): { cutoffStart: string; cutoffEnd: string } {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  const lastDay = new Date(year, month + 1, 0).getDate();

  if (interval === "monthly") {
    return {
      cutoffStart: isoDate(new Date(year, month, 1)),
      cutoffEnd: isoDate(new Date(year, month, lastDay)),
    };
  }

  if (day <= 15) {
    return {
      cutoffStart: isoDate(new Date(year, month, 1)),
      cutoffEnd: isoDate(new Date(year, month, 15)),
    };
  }
  return {
    cutoffStart: isoDate(new Date(year, month, 16)),
    cutoffEnd: isoDate(new Date(year, month, lastDay)),
  };
}

const CUTOFF_DISPLAY = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" });

/** "Aug 1 - Aug 15" from two ISO dates -- local display only, not sent anywhere. */
export function formatCutoffRange(cutoffStart: string, cutoffEnd: string): string {
  const start = CUTOFF_DISPLAY.format(new Date(`${cutoffStart}T00:00:00`));
  const end = CUTOFF_DISPLAY.format(new Date(`${cutoffEnd}T00:00:00`));
  return `${start} – ${end}`;
}
