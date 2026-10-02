// Whole-day leave (supabase/add-leave.sql, LEAVE_PLAN.md). Rest off, the
// hour-window kind, stays in features/ledger/rest-off.actions.ts.

export type LeaveKind = "sil" | "in_kind" | "unpaid" | "extra_paid";
export type LeaveReason = "vacation" | "sick" | "family" | "other";
export type LeaveStatus = "pending" | "approved" | "declined" | "cancelled";

export type LeaveRequest = {
  id: string;
  helperId: string;
  kind: LeaveKind;
  reason: LeaveReason;
  /** YYYY-MM-DD, household dates, inclusive. */
  startDate: string;
  endDate: string;
  /** Working days (her rest day doesn't count). */
  days: number;
  /** Rest owed it costs, for a day off in kind. */
  minutes: number;
  note: string | null;
  status: LeaveStatus;
  declineReason: string | null;
  /** Set when a manager recorded it for her: her answer, pending until she gives it. */
  helperAck: "pending" | "confirmed" | "disputed" | null;
  helperAckNote: string | null;
};

/** One helper's leave balances, from the same Postgres functions the approval checks use. */
/** The household's service incentive leave rule (supabase/add-leave-policy.sql). */
export type LeavePolicy = {
  /** True: SIL from her second service year, as RA 10361 has it. False: from day one. */
  silWaitsFirstYear: boolean;
  /** 5 by law; a household may give more. */
  silDaysPerYear: number;
};

export type LeaveBalance = {
  helperId: string;
  /** Service incentive leave left in the current service year. */
  silDays: number;
  /** Her first anniversary: SIL starts then. */
  silEligibleFrom: string | null;
  /** The last day of the current service year, when she's eligible. */
  silYearEnd: string | null;
  restOwedMinutes: number;
};
