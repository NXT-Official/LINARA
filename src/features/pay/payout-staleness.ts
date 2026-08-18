import type { Payslip } from "./pay.types";

/**
 * How long a payout has been in a non-terminal state, and whether that is
 * still normal.
 *
 * Session E / E5. `pending_send` and `processing` both render as "Sending…" /
 * "Processing" indefinitely, so a payout that is genuinely stuck looks
 * identical to one that is merely young. C21 recorded that as accepted when
 * nothing had ever really paid out; the path moves money now, and a row nobody
 * can tell is stuck is a payout nobody is chasing.
 *
 * The two states go wrong for different reasons, so they get different
 * thresholds:
 *
 *   pending_send -- initiate_payslip wrote the row and the Xendit call never
 *     resolved: the server function died between the two (see the two-phase
 *     note on initiatePayoutFn). Nothing else can move this row. Xendit
 *     answers in seconds, so anything past a couple of minutes is not slow,
 *     it is abandoned -- and crucially it is AMBIGUOUS, because the request
 *     may or may not have reached Xendit before the process died.
 *
 *   processing -- Xendit accepted it and the terminal status arrives by
 *     webhook. Sandbox settles in ~80 seconds, real e-wallet payouts usually
 *     within minutes, but Xendit's own estimated_arrival_time has been seen at
 *     +15 minutes. An hour allows for a genuinely slow channel while still
 *     catching the failure this is really for: a webhook that never lands
 *     (C44 -- where a stale deployment 500'd every callback and payouts would
 *     have sat here forever).
 *
 * Thresholds are deliberately generous. A false "stuck" badge on a healthy
 * payout teaches a manager to ignore the badge, which costs more than the few
 * extra minutes of waiting it saves.
 */

export const PENDING_SEND_STALE_MINUTES = 2;
export const PROCESSING_STALE_MINUTES = 60;

export interface PayoutStaleness {
  /** Minutes since the payout was requested. */
  ageMinutes: number;
  /** True once the age passes this status's threshold. */
  isStale: boolean;
  /**
   * What a manager can actually do about it. `pending_send` may never have
   * reached Xendit, so the answer is to ask Xendit rather than to assume
   * either way -- assuming "not sent" and re-paying is how you pay twice.
   */
  advice: string | null;
}

const NOT_STALE: PayoutStaleness = { ageMinutes: 0, isStale: false, advice: null };

export function payoutStaleness(payslip: Payslip, nowMs: number): PayoutStaleness {
  if (payslip.payoutStatus !== "pending_send" && payslip.payoutStatus !== "processing") {
    return NOT_STALE;
  }

  const requestedMs = new Date(payslip.requestedAt).getTime();
  if (Number.isNaN(requestedMs)) return NOT_STALE;

  // Clamp at zero: a row requested "in the future" means clock skew between
  // Postgres and this browser, not a time-travelling payout, and a negative
  // age must never read as stale.
  const ageMinutes = Math.max(0, Math.floor((nowMs - requestedMs) / 60_000));

  const threshold =
    payslip.payoutStatus === "pending_send" ? PENDING_SEND_STALE_MINUTES : PROCESSING_STALE_MINUTES;

  if (ageMinutes < threshold) return { ageMinutes, isStale: false, advice: null };

  return {
    ageMinutes,
    isStale: true,
    advice:
      payslip.payoutStatus === "pending_send"
        ? "This never finished sending. It may or may not have reached Xendit — check before paying again."
        : "Xendit accepted this but never confirmed it. Check whether it has settled.",
  };
}

/** Human-readable age, for a badge that has to stay short. */
export function formatAge(ageMinutes: number): string {
  if (ageMinutes < 60) return `${ageMinutes}m`;
  const hours = Math.floor(ageMinutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
