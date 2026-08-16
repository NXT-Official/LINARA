import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";
import { computeStatutorySplit, cutoffsPerMonth } from "@/features/people/people.utils";
import type { PaydayInterval } from "@/features/people/people.types";

import type { PayoutChannelCode } from "./pay.types";
import { currentCutoffRange } from "./pay.utils";

export interface PayslipRow {
  id: string;
  helper_id: string;
  cutoff_start: string;
  cutoff_end: string;
  base_pay: number;
  statutory_employee_share: number;
  vale_deductions: number;
  net_pay: number;
  payout_channel_code: PayoutChannelCode;
  payout_status: "pending_send" | "processing" | "succeeded" | "failed" | "needs_review";
  failure_reason: string | null;
  requested_at: string;
  confirmed_at: string | null;
}

type AuthedClient = ReturnType<typeof createAuthedClient>;

/** Attempt-level outcome. Rolled up to a payslip status in Postgres by
 *  record_payout_attempt_result -- see supabase/add-payout-attempts.sql. */
type AttemptStatus = "accepted" | "succeeded" | "failed" | "cancelled" | "ambiguous";

/**
 * Record an attempt's outcome and roll it up to the parent payslip in one
 * transaction. Vale release is decided in Postgres (only 'failed'/'cancelled'
 * release them -- never 'ambiguous', whose vales may already have been paid).
 */
async function recordAttempt(
  client: AuthedClient,
  attemptId: string,
  status: AttemptStatus,
  opts: { pspPayoutId?: string | null; failureReason?: string | null } = {},
) {
  const { error } = await client.rpc("record_payout_attempt_result", {
    p_attempt_id: attemptId,
    p_status: status,
    p_psp_payout_id: opts.pspPayoutId ?? null,
    p_failure_reason: opts.failureReason ?? null,
  });
  if (error) {
    console.error("[initiatePayoutFn] Failed to record attempt result:", error.message);
  }
}

/**
 * Reconciliation: ask Xendit what actually happened to a reference id, rather
 * than guessing. This is what makes an ambiguous outcome recoverable -- the
 * industry-standard answer to "did the PSP get my request?" is to look it up
 * by your own reference, not to replay an idempotency key and infer from the
 * error. Returns null when the lookup itself fails (then, and only then, does
 * the attempt land in 'ambiguous' for a human).
 */
async function lookupXenditPayout(
  xenditUrl: string,
  xenditKey: string,
  referenceId: string,
): Promise<{ id?: string; status?: string } | null> {
  try {
    const res = await fetch(
      `${xenditUrl}/v2/payouts?reference_id=${encodeURIComponent(referenceId)}`,
      {
        method: "GET",
        headers: { Authorization: `Basic ${Buffer.from(`${xenditKey}:`).toString("base64")}` },
      },
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as
      { data?: Array<{ id?: string; status?: string }> } | Array<{ id?: string; status?: string }>;
    const rows = Array.isArray(payload) ? payload : (payload.data ?? []);
    return rows.length > 0 ? rows[0] : null;
  } catch {
    return null;
  }
}

/** Xendit payout status -> our attempt status. */
function attemptStatusFromXendit(status: string | undefined): AttemptStatus | null {
  switch ((status ?? "").toUpperCase()) {
    case "ACCEPTED":
    case "REQUESTED":
    case "PENDING":
      return "accepted";
    case "SUCCEEDED":
    case "COMPLETED":
      return "succeeded";
    case "FAILED":
      return "failed";
    case "CANCELLED":
    case "REVERSED":
      return "cancelled";
    default:
      return null;
  }
}

/**
 * Lists every payslip in the caller's household. payslips_isolation
 * (supabase/add-payslips-table.sql) scopes this via a join through
 * helper_profiles, same pattern as listValesFn/listLedgerEntriesFn.
 */
export const listPayslipsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient
      .from("payslips")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (rows ?? []) as PayslipRow[];
  });

interface XenditPayoutResponse {
  id?: string;
  message?: string;
  error_code?: string;
  errors?: Array<{ message?: string }>;
}

/**
 * Manager-only (enforced inside initiate_payslip itself, same posture as
 * every other manager-gated RPC in this app -- see
 * create_appointment_with_preps/updateHouseholdBudgetFn). Two-phase, not
 * fully atomic end to end: (1) initiate_payslip inserts the payslip row and
 * settles the helper's unsettled approved vales in one Postgres transaction
 * (true atomicity requirement -- can't happen non-atomically without risking
 * double-counted or dropped vales), then (2) this function calls Xendit and
 * writes the result back with a second, plain update. That second step
 * can't be inside the same DB transaction as step 1 since Postgres can't
 * make outbound HTTPS calls here -- so if the process crashes between (1)
 * and (2), a payslip could be stuck at "pending_send" forever. Low-stakes:
 * it just means a manager sees the payslip and can tell (from the stuck
 * status) that the payout was never actually sent, distinct from a genuine
 * Xendit failure (which sets failure_reason). No auto-retry -- out of scope.
 *
 * Intent + attempts (Session A', supabase/add-payout-attempts.sql): the
 * payslip is the INTENT (one per helper+cutoff, carrying the unique
 * constraint), and every Xendit call is an append-only row in
 * payout_attempts with its OWN reference id / Idempotency-key. The key is
 * therefore transport-scoped -- it guards one HTTP request, not the cutoff
 * forever. Business dedup is the unique constraint plus the status machine
 * (only a 'failed' payslip may spawn another attempt).
 *
 * Outcome handling, in order of preference:
 *   1. 2xx                 -> attempt 'accepted'   -> payslip 'processing'.
 *   2. No response at all   -> DON'T GUESS. Look the reference id up via
 *                              GET /v2/payouts?reference_id=... and adopt the
 *                              real status. This is what makes an ambiguous
 *                              send recoverable without human intervention.
 *   3. Lookup also failed   -> attempt 'ambiguous' -> payslip 'needs_review'.
 *                              Vales stay settled (they may already be paid)
 *                              and initiate_payslip refuses a retry until a
 *                              human reconciles.
 *   4. Explicit rejection   -> attempt 'failed'    -> payslip 'failed', vales
 *                              released, cutoff retryable with a FRESH key.
 * The attempt -> payslip rollup and the vale release both happen inside
 * record_payout_attempt_result, so they can't drift apart.
 *
 * Returns { payslipId, netPay, status } for the non-throwing outcomes and
 * throws for a genuine failure (the UI toasts the thrown message).
 */
export const initiatePayoutFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; helperId: string; channelCode: PayoutChannelCode }) => data)
  .handler(async ({ data }) => {
    const { token, helperId, channelCode } = data;
    const authedClient = createAuthedClient(token);

    const { data: helperRow, error: helperError } = await authedClient
      .from("helper_profiles")
      .select("name, phone, monthly_rate, payday_interval")
      .eq("id", helperId)
      .single();

    if (helperError || !helperRow) {
      throw new Error("Helper not found");
    }
    if (!helperRow.phone) {
      throw new Error("This helper has no phone number on file -- add one before paying out.");
    }

    const paydayInterval = helperRow.payday_interval as PaydayInterval;
    const monthlyRate = Number(helperRow.monthly_rate);
    const cutoffs = cutoffsPerMonth(paydayInterval);
    const basePay = monthlyRate / cutoffs;
    const statutoryShare = computeStatutorySplit(monthlyRate).totalEmployee / cutoffs;
    const { cutoffStart, cutoffEnd } = currentCutoffRange(new Date(), paydayInterval);

    // No client-minted reference id any more: initiate_payslip derives it
    // deterministically from (helper, cutoff) and reuses it across retries, so
    // a retry replays the SAME Xendit Idempotency-key instead of minting a
    // fresh one (the old crypto.randomUUID() per attempt was double-pay Vector
    // A). See supabase/add-payslip-double-pay-guards.sql.
    const { data: rpcRows, error: rpcError } = await authedClient.rpc("initiate_payslip", {
      p_helper_id: helperId,
      p_cutoff_start: cutoffStart,
      p_cutoff_end: cutoffEnd,
      p_base_pay: basePay,
      p_statutory_employee_share: statutoryShare,
      p_channel_code: channelCode,
    });

    if (rpcError || !rpcRows?.[0]) {
      throw new Error(rpcError?.message || "Failed to create payslip");
    }

    const payslipId = rpcRows[0].payslip_id as string;
    const netPay = Number(rpcRows[0].net_pay);
    const attemptId = rpcRows[0].attempt_id as string;
    const referenceId = rpcRows[0].reference_id as string;

    const xenditKey = process.env.XENDIT_SECRET_WRITE_KEY || "";
    const xenditUrl = process.env.XENDIT_API_URL || "https://api.xendit.co";

    if (!xenditKey) {
      // Nothing was ever sent -- definitively failed, so the vales are freed
      // and the cutoff stays retryable once the key is configured.
      await recordAttempt(authedClient, attemptId, "failed", {
        failureReason: "XENDIT_SECRET_WRITE_KEY is not configured",
      });
      throw new Error("XENDIT_SECRET_WRITE_KEY is not configured");
    }

    // (1) Send the payout. This attempt's reference id is fresh, so it is
    // BOTH the Xendit reference_id and the Idempotency-key -- the key protects
    // an in-process network retry of this one request, nothing more. Business
    // dedup is payslips_one_per_cutoff plus the status machine.
    let response: Response;
    try {
      response = await fetch(`${xenditUrl}/v2/payouts`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${xenditKey}:`).toString("base64")}`,
          "Content-Type": "application/json",
          "Idempotency-key": referenceId,
        },
        body: JSON.stringify({
          reference_id: referenceId,
          channel_code: channelCode,
          channel_properties: {
            account_holder_name: helperRow.name,
            account_number: helperRow.phone,
          },
          // Xendit v2/payouts takes a DECIMAL amount in major units (PHP), not
          // centavos -- sending cents once paid out 100x (KNOWN_GAPS.md C35).
          // The *100/100 is a round-to-2-decimals idiom, NOT a unit
          // conversion; do not "simplify" the /100 away.
          amount: Math.round(netPay * 100) / 100,
          currency: "PHP",
          description: `LINARA payout ${cutoffStart} to ${cutoffEnd}`,
        }),
      });
    } catch (networkErr) {
      // No response at all -- Xendit may or may not have received this. Don't
      // guess: ask them what happened to this reference id.
      const detail = networkErr instanceof Error ? networkErr.message : "network error";
      const found = await lookupXenditPayout(xenditUrl, xenditKey, referenceId);
      const resolved = found ? attemptStatusFromXendit(found.status) : null;

      if (resolved) {
        await recordAttempt(authedClient, attemptId, resolved, {
          pspPayoutId: found?.id ?? null,
          failureReason: resolved === "accepted" ? null : `Xendit reports ${found?.status}`,
        });
        if (resolved === "accepted" || resolved === "succeeded") {
          return { payslipId, netPay, status: "processing" as const };
        }
        throw new Error(`Hindi natuloy ang payout — Xendit reports ${found?.status}.`);
      }

      // Lookup failed too. Only NOW is it genuinely ambiguous.
      await recordAttempt(authedClient, attemptId, "ambiguous", {
        failureReason: `Couldn't confirm the payout reached Xendit (${detail}), and the reference lookup also failed. Reconcile in the Xendit dashboard before retrying.`,
      });
      throw new Error(
        "Hindi makumpirma kung natanggap ng Xendit ang payout. Naka-hold para i-review — tignan sa Xendit bago ulitin.",
      );
    }

    const body: XenditPayoutResponse = await response
      .json()
      .catch(() => ({}) as XenditPayoutResponse);

    // (2) Xendit accepted (2xx).
    if (response.ok) {
      await recordAttempt(authedClient, attemptId, "accepted", { pspPayoutId: body.id ?? null });
      return { payslipId, netPay, status: "processing" as const };
    }

    // (3) Xendit replied with an error. A duplicate here means this attempt's
    // key was somehow already used -- which should be impossible now that keys
    // are per-attempt and UNIQUE. Treat it as a bug signal, but resolve it the
    // safe way: look the reference up rather than assume.
    const errorText = `${body.error_code ?? ""} ${body.message ?? ""} ${body.errors?.[0]?.message ?? ""}`;
    const isDuplicate = response.status === 409 || /duplicate|idempotency[ -]?key/i.test(errorText);

    if (isDuplicate) {
      const found = await lookupXenditPayout(xenditUrl, xenditKey, referenceId);
      const resolved = found ? attemptStatusFromXendit(found.status) : null;
      await recordAttempt(authedClient, attemptId, resolved ?? "ambiguous", {
        pspPayoutId: found?.id ?? null,
        failureReason: resolved
          ? null
          : "Xendit reported a duplicate idempotency key but the reference lookup found nothing. Reconcile before retrying.",
      });
      if (resolved === "accepted" || resolved === "succeeded") {
        return { payslipId, netPay, status: "processing" as const };
      }
      throw new Error(
        "Duplicate na naiulat ang Xendit para sa payout na ito. Naka-hold para i-review.",
      );
    }

    // Genuine rejection: Xendit received it and said no (bad account number,
    // insufficient balance, ...). Safe to retry -- vales are freed in Postgres.
    const message = body.message || body.errors?.[0]?.message || `Xendit error ${response.status}`;
    await recordAttempt(authedClient, attemptId, "failed", { failureReason: message });
    throw new Error(message);
  });
