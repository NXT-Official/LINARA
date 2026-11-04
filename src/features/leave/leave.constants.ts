import { currentT } from "@/lib/i18n/current-t";
import { lazyMessages } from "@/lib/i18n/lazy-messages";

import type { LeaveKind, LeaveReason, LeaveStatus } from "./leave.types";

export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = lazyMessages({
  sil: "leave.kindSil",
  in_kind: "leave.kindInKind",
  unpaid: "leave.kindUnpaid",
  extra_paid: "leave.kindExtraPaid",
});

/** The SIL line under the form, for the household's rule. */
export function silHint(policy: { silWaitsFirstYear: boolean; silDaysPerYear: number } | null) {
  if (!policy) return LEAVE_KIND_HINT.sil;
  const t = currentT();
  const days = t("leave.daysPerYear", { days: policy.silDaysPerYear });
  return policy.silWaitsFirstYear
    ? t("leave.silAfterFirstYear", { days })
    : t("leave.silFromDayOne", { days });
}

/** What each kind costs, for the forms. */
export const LEAVE_KIND_HINT: Record<LeaveKind, string> = lazyMessages({
  sil: "leave.hintSil",
  in_kind: "leave.hintInKind",
  unpaid: "leave.hintUnpaid",
  extra_paid: "leave.hintExtraPaid",
});

/** "Rosa on unpaid leave" / "Rosa asked for unpaid leave". */
export const LEAVE_ON: Record<LeaveKind, string> = lazyMessages({
  sil: "leave.onSil",
  in_kind: "leave.onInKind",
  unpaid: "leave.onUnpaid",
  extra_paid: "leave.onExtraPaid",
});
export const LEAVE_ASKED: Record<LeaveKind, string> = lazyMessages({
  sil: "leave.askedSil",
  in_kind: "leave.askedInKind",
  unpaid: "leave.askedUnpaid",
  extra_paid: "leave.askedExtraPaid",
});

export const LEAVE_REASON_LABEL: Record<LeaveReason, string> = lazyMessages({
  vacation: "leave.reasonVacation",
  sick: "leave.reasonSick",
  family: "leave.reasonFamily",
  other: "leave.reasonOther",
});

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = lazyMessages({
  pending: "leave.statusWaiting",
  approved: "leave.statusApproved",
  declined: "leave.statusDeclined",
  cancelled: "leave.statusCancelled",
});

/**
 * helper_profiles.pay_days_per_year: the unpaid-leave divisor (LEGAL_CONSIDERATIONS.md).
 * 365 is every helper's default, live-in or not, and the smallest deduction;
 * the label used to say "(live-in)" and read as if it followed the arrangement.
 */
export const PAY_DAYS_OPTIONS = [
  {
    value: 365,
    get label() {
      return currentT()("leave.payDays365");
    },
  },
  {
    value: 313,
    get label() {
      return currentT()("leave.payDays313");
    },
  },
  {
    value: 261,
    get label() {
      return currentT()("leave.payDays261");
    },
  },
] as const;
