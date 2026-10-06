import type { LeaveKind, LeaveReason, LeaveStatus } from "./leave.types";

export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = {
  sil: "Service incentive leave",
  in_kind: "Day off in kind",
  unpaid: "Unpaid leave",
  extra_paid: "Extra paid day",
};

/** The SIL line under the form, for the household's rule. */
export function silHint(policy: { silWaitsFirstYear: boolean; silDaysPerYear: number } | null) {
  if (!policy) return LEAVE_KIND_HINT.sil;
  const days = `${policy.silDaysPerYear} days a service year`;
  return policy.silWaitsFirstYear
    ? `Paid. ${days} after the first year (RA 10361).`
    : `Paid. ${days} from day one (your household's rule; the law starts after a year).`;
}

/** What each kind costs, for the forms. */
export const LEAVE_KIND_HINT: Record<LeaveKind, string> = {
  sil: "Paid. 5 days a service year after the first year (RA 10361).",
  in_kind: "Paid in rest: each day comes out of their rest owed.",
  unpaid: "Not paid. Deducted from that period's pay.",
  extra_paid: "Paid. The household's own extra, with no balance.",
};

/** "Rosa on unpaid leave" / "Rosa asked for unpaid leave". */
export const LEAVE_ON: Record<LeaveKind, string> = {
  sil: "on leave (SIL)",
  in_kind: "on a day off in kind",
  unpaid: "on unpaid leave",
  extra_paid: "on a paid day off",
};
export const LEAVE_ASKED: Record<LeaveKind, string> = {
  sil: "asked for leave (SIL)",
  in_kind: "asked for a day off in kind",
  unpaid: "asked for unpaid leave",
  extra_paid: "asked for a paid day off",
};

export const LEAVE_REASON_LABEL: Record<LeaveReason, string> = {
  vacation: "Vacation",
  sick: "Sick",
  family: "Family",
  other: "Other",
};

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Waiting",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};

/** helper_profiles.pay_days_per_year: the unpaid-leave divisor (LEGAL_CONSIDERATIONS.md). */
export const PAY_DAYS_OPTIONS = [
  { value: 365, label: "Every day (live-in)" },
  { value: 313, label: "Six days a week" },
  { value: 261, label: "Five days a week" },
] as const;
