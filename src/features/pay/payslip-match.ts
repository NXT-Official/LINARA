/**
 * The regular payslip that settled a cutoff, if any. Matched by overlap, not
 * exact bounds: a first or final cutoff is stored with the days she worked
 * (add-pay-periods.sql), and older payslips with the full bounds. A failed
 * payslip settles nothing.
 */
export function payslipCovering<
  T extends {
    helperId: string;
    kind: string;
    cutoffStart: string;
    cutoffEnd: string;
    payoutStatus: string;
  },
>(payslips: T[], helperId: string, cutoffStart: string, cutoffEnd: string): T | undefined {
  return payslips.find(
    (p) =>
      p.helperId === helperId &&
      p.kind === "regular" &&
      p.payoutStatus !== "failed" &&
      p.cutoffStart <= cutoffEnd &&
      p.cutoffEnd >= cutoffStart,
  );
}
