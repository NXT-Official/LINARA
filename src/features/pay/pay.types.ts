// Per-cutoff payout records -- real as of KNOWN_GAPS.md gap #9's close. See
// supabase/add-payslips-table.sql for the schema decisions.

export type PayoutChannelCode = "PH_GCASH" | "PH_PAYMAYA";
export type PayoutStatus = "pending_send" | "processing" | "succeeded" | "failed";

export type Payslip = {
  id: string;
  helperId: string;
  cutoffStart: string; // ISO date, e.g. "2026-08-01"
  cutoffEnd: string;
  basePay: number;
  statutoryEmployeeShare: number;
  valeDeductions: number;
  netPay: number;
  payoutChannelCode: PayoutChannelCode;
  payoutStatus: PayoutStatus;
  failureReason: string | null;
  requestedAt: string;
  confirmedAt: string | null;
};
