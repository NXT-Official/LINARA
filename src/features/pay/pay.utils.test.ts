import { describe, expect, it } from "vitest";

import { formatCutoffRange } from "./pay.utils";

/**
 * Session B (PAYMENTS_REMEDIATION.md) removed `currentCutoffRange` from this
 * module -- cutoff boundaries are derived in Postgres now
 * (`public.household_cutoff`, supabase/add-household-timezone-and-cutoffs.sql)
 * and the boundary cases are asserted there, where the arithmetic lives.
 *
 * What is still worth testing HERE is the one date-handling behaviour that
 * remains client-side: display formatting must not shift the day under any
 * timezone. That is the exact class of bug that broke the deleted function --
 * it mixed local date components with a UTC render -- so these run under the
 * three zones `src/lib/time.test.ts` established as the precedent, including
 * a positive UTC offset (the direction that actually broke) and a negative one.
 */
const ZONES = ["UTC", "Asia/Manila", "America/Los_Angeles"] as const;

function withTimeZone<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = previous;
  }
}

describe("formatCutoffRange", () => {
  it.each(ZONES)("does not shift the rendered day under TZ=%s", (tz) => {
    const formatted = withTimeZone(tz, () => formatCutoffRange("2026-08-01", "2026-08-15"));
    expect(formatted).toContain("1");
    expect(formatted).toContain("15");
    expect(formatted).toContain("Aug");
  });

  it.each(ZONES)("renders a month-end boundary intact under TZ=%s", (tz) => {
    // The deleted currentCutoffRange truncated this to Aug 30 in Asia/Manila,
    // orphaning the 31st. Display must never do the same.
    const formatted = withTimeZone(tz, () => formatCutoffRange("2026-08-16", "2026-08-31"));
    expect(formatted).toContain("16");
    expect(formatted).toContain("31");
  });

  it.each(ZONES)("renders a leap-February end intact under TZ=%s", (tz) => {
    const formatted = withTimeZone(tz, () => formatCutoffRange("2028-02-16", "2028-02-29"));
    expect(formatted).toContain("29");
    expect(formatted).toContain("Feb");
  });

  it("no longer exports a client-side cutoff derivation", async () => {
    // Guards the Session B invariant: a calendar day that gets persisted or
    // compared is computed in Postgres. If someone reintroduces a local
    // derivation here, this fails and points them at the reason.
    const mod = await import("./pay.utils");
    expect(Object.keys(mod)).toEqual(["formatCutoffRange"]);
  });
});
