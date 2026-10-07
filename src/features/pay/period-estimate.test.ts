import { describe, expect, it } from "vitest";

import type { Helper } from "@/features/people/people.types";

import type { PayPeriod } from "./pay.types";
import { earlierOwed, periodEstimate } from "./period-estimate";

const helper = { monthlyRate: 9000, paydayInterval: "semi_monthly" } as Helper;

const period = (fullStart: string, fullEnd: string, workedStart = fullStart): PayPeriod => ({
  fullStart,
  fullEnd,
  workedStart,
  workedEnd: fullEnd,
  isCurrent: false,
  isFinal: false,
  payslipId: null,
  payslipStatus: null,
  payslipProvider: null,
  payslipAck: null,
});

describe("earlierOwed", () => {
  it("is nothing when no earlier cutoff closed unpaid", () => {
    expect(earlierOwed(helper, [])).toBe(0);
  });

  it("adds up each unpaid cutoff's estimate, part-worked ones included", () => {
    const full = period("2026-09-01", "2026-09-15");
    const partial = period("2026-08-16", "2026-08-31", "2026-08-24");
    expect(earlierOwed(helper, [full, partial])).toBe(
      periodEstimate(helper, full) + periodEstimate(helper, partial),
    );
    expect(periodEstimate(helper, partial)).toBeLessThan(periodEstimate(helper, full));
  });
});
