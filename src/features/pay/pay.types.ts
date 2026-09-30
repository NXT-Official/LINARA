// Per-cutoff payout records -- real as of KNOWN_GAPS.md gap #9's close. See
// supabase/add-payslips-table.sql for the schema decisions.

/** How Linara itself pays out (Xendit). */
export type PayoutChannelCode = "PH_GCASH" | "PH_PAYMAYA";
/** How a household paid outside Linara, recorded after the fact. */
export type OffAppMethod = "CASH" | "BANK_TRANSFER" | "OTHER";
export type PaymentMethod = PayoutChannelCode | OffAppMethod;
/** A regular cutoff, or 13th-month pay (RA 10361 Sec. 25). */
export type PayslipKind = "regular" | "thirteenth_month";
/** Her answer to a payment recorded outside Linara; null for a Xendit payout. */
export type HelperAck = "pending" | "confirmed" | "disputed";

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  PH_GCASH: "GCash",
  PH_PAYMAYA: "Maya",
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};
export type PayoutStatus =
  | "pending_send"
  | "processing"
  | "succeeded"
  | "failed"
  // Ambiguous payout the manager must reconcile against Xendit before it can
  // move again -- see supabase/add-payslip-double-pay-guards.sql and
  // src/features/pay/pay.actions.ts's failure taxonomy.
  | "needs_review";

export type Payslip = {
  id: string;
  helperId: string;
  cutoffStart: string; // ISO date, e.g. "2026-08-01"
  cutoffEnd: string;
  basePay: number;
  statutoryEmployeeShare: number;
  valeDeductions: number;
  netPay: number;
  kind: PayslipKind;
  /** "xendit", or "manual" for a payment made outside Linara. */
  payoutProvider: string;
  payoutChannelCode: PaymentMethod;
  payoutStatus: PayoutStatus;
  failureReason: string | null;
  requestedAt: string;
  confirmedAt: string | null;
  /** The day it was paid, for a payment made outside Linara. */
  paidOn: string | null;
  manualNote: string | null;
  helperAck: HelperAck | null;
  helperAckNote: string | null;
};

/** One cutoff of one employment -- supabase/add-pay-periods.sql's helper_pay_periods. */
export type PayPeriod = {
  fullStart: string;
  fullEnd: string;
  /** The days she actually worked in it: a first period starts on her first
   * day, a final one stops on her last. */
  workedStart: string;
  workedEnd: string;
  isCurrent: boolean;
  isFinal: boolean;
  /** The payment that settled it, of either kind; null while unpaid. */
  payslipId: string | null;
  payslipStatus: PayoutStatus | null;
  payslipProvider: string | null;
  payslipAck: HelperAck | null;
};

/** 13th-month pay for one employment and year -- thirteenth_month_due. */
export type ThirteenthMonth = {
  year: number;
  periodStart: string;
  periodEnd: string;
  basicEarned: number;
  amount: number;
  payslipId: string | null;
  payslipStatus: PayoutStatus | null;
  payable: boolean;
  payableFrom: string;
  dueBy: string;
};
