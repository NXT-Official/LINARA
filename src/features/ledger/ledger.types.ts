import type { Station } from "@/features/people/people.types";

export type LedgerResolution = "rest" | "premium";
export type LedgerReason = "available" | "override" | "emergency" | "rest_day" | "rest_break";
export type LedgerEntry = {
  id: string;
  sourceId: string; // task id or utos id
  kind: "task" | "utos";
  title: string;
  station?: Station;
  appointmentTitle?: string;
  startTs: number;
  doneTs: number;
  autoMinutes: number;
  adjustMinutes: number;
  resolution: LedgerResolution;
  reason: LedgerReason;
};

export type ValeStatus = "pending" | "approved" | "declined";
export type ValeRequest = {
  id: string;
  helperId: string;
  amount: number;
  reason: string;
  status: ValeStatus;
  /** The payslip that already deducted this vale, if any -- see
   * supabase/add-payslips-table.sql. Approved vales with settledInPayslipId
   * still null haven't been paid out yet and are still outstanding. */
  settledInPayslipId: string | null;
};
