import type { Helper } from "@/features/people/people.types";

import { netPayForCutoff, workedShareOfCutoff } from "./net-pay";
import type { PayPeriod } from "./pay.types";

/**
 * What a period pays before vale: basic for the days worked, less
 * contributions. Through netPayForCutoff, so it is the same rule the payout
 * snapshots rather than a second statement of it. Vale is left out because it
 * comes off whichever payment goes first, not every period; so is unpaid leave,
 * which comes off the first payment for a cutoff ending on or after it
 * (callers that know which payment is next subtract `unpaid_leave_due`).
 */
export function periodEstimate(helper: Helper, period: PayPeriod): number {
  const share = workedShareOfCutoff(
    period.workedStart,
    period.workedEnd,
    period.fullStart,
    period.fullEnd,
  );
  return netPayForCutoff(helper.monthlyRate, helper.paydayInterval, 0, share);
}
