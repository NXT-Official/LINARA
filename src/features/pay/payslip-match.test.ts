import { describe, expect, it } from "vitest";

import { payslipCovering } from "./payslip-match";

describe("payslipCovering", () => {
  const slip = (over: Partial<Parameters<typeof payslipCovering>[0][number]>) => ({
    helperId: "h1",
    kind: "regular",
    cutoffStart: "2026-09-01",
    cutoffEnd: "2026-09-15",
    payoutStatus: "succeeded",
    ...over,
  });

  it("finds a payslip stored with the days worked, not the full bounds", () => {
    const first = slip({ cutoffStart: "2026-09-10" });
    expect(payslipCovering([first], "h1", "2026-09-01", "2026-09-15")).toBe(first);
  });

  it("ignores failed payslips, 13th-month pay, other helpers and other cutoffs", () => {
    expect(
      payslipCovering(
        [
          slip({ payoutStatus: "failed" }),
          slip({ kind: "thirteenth_month", cutoffStart: "2026-01-01", cutoffEnd: "2026-12-31" }),
          slip({ helperId: "h2" }),
          slip({ cutoffStart: "2026-09-16", cutoffEnd: "2026-09-30" }),
        ],
        "h1",
        "2026-09-01",
        "2026-09-15",
      ),
    ).toBeUndefined();
  });
});
