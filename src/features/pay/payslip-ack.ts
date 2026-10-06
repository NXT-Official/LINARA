import type { Payslip } from "./pay.types";

/**
 * A payment recorded outside Linara is only the manager's word until the
 * helper confirms it in their app, so it isn't shown as "Paid" before then:
 * "recorded" while waiting, "disputed" if they say it never arrived. Null for
 * anything else (a Xendit payout, a confirmed one, no payslip).
 */
export function manualAckState(
  payslip: Pick<Payslip, "payoutProvider" | "payoutStatus" | "helperAck"> | null,
): "recorded" | "disputed" | null {
  if (!payslip || payslip.payoutProvider !== "manual" || payslip.payoutStatus !== "succeeded")
    return null;
  if (payslip.helperAck === "confirmed") return null;
  return payslip.helperAck === "disputed" ? "disputed" : "recorded";
}
