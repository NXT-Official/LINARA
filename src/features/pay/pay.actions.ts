import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";
import type { PaydayInterval } from "@/features/people/people.types";

import { payComponentsForCutoff } from "./net-pay";

import type { PayoutChannelCode } from "./pay.types";

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

type XenditPayoutSummary = { id?: string; status?: string };

/**
 * "Xendit has no such payout" and "we couldn't ask Xendit" are different facts,
 * and conflating them is how a reconciliation double-pays. Hence a discriminated
 * result rather than a bare null.
 */
type XenditLookup = { ok: true; payout: XenditPayoutSummary | null } | { ok: false };

/**
 * Reconciliation: ask Xendit what actually happened to a reference id, rather
 * than guessing. This is what makes an ambiguous outcome recoverable -- the
 * industry-standard answer to "did the PSP get my request?" is to look it up
 * by your own reference, not to replay an idempotency key and infer from the
 * error.
 *
 * Response shape VERIFIED against the live sandbox 2026-08-17 (E1, probes
 * 1B/1F -- see E1_XENDIT_VERIFICATION.md). It is always an object:
 *
 *   {"has_more":false,"data":[{ id, status, reference_id, ... }]}
 *
 * An earlier draft also accepted a bare top-level array; that was a defensive
 * guess and never occurs, so it's gone. And an unknown reference returns HTTP
 * 200 with an EMPTY data array, not a 404 -- which is exactly why `{ok:true,
 * payout:null}` is a real, usable answer and not the same thing as `{ok:false}`.
 */
async function lookupXenditPayout(
  xenditUrl: string,
  xenditKey: string,
  referenceId: string,
): Promise<XenditLookup> {
  try {
    const res = await fetch(
      `${xenditUrl}/v2/payouts?reference_id=${encodeURIComponent(referenceId)}`,
      {
        method: "GET",
        headers: { Authorization: `Basic ${Buffer.from(`${xenditKey}:`).toString("base64")}` },
      },
    );
    if (!res.ok) return { ok: false };
    const payload = (await res.json()) as {
      has_more?: boolean;
      data?: Array<XenditPayoutSummary>;
    };
    return { ok: true, payout: payload.data?.[0] ?? null };
  } catch {
    return { ok: false };
  }
}

/** Xendit payout status -> our attempt status. ACCEPTED, REQUESTED, SUCCEEDED
 *  and FAILED were all observed on the live sandbox 2026-08-17 (E1) -- a single
 *  payout went ACCEPTED -> REQUESTED -> SUCCEEDED within ~80s. CANCELLED is
 *  real (C35 cancelled one by hand); PENDING/COMPLETED/REVERSED are unobserved
 *  and kept as tolerant aliases. */
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

export interface HouseholdCutoff {
  today: string;
  cutoffStart: string;
  cutoffEnd: string;
  timezone: string;
}

/**
 * The current cutoff for a payday interval, derived in Postgres from
 * (now() AT TIME ZONE households.timezone)::date -- see
 * supabase/add-household-timezone-and-cutoffs.sql. This is the ONLY way the
 * client learns what "this cutoff" is; it must never compute one itself, or
 * client and server go back to disagreeing (which is what kept the Pay buttons
 * on screen after a successful payout).
 */
export const getHouseholdCutoffFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; paydayInterval: PaydayInterval }) => data)
  .handler(async ({ data }) => {
    const { token, paydayInterval } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient.rpc("household_cutoff", {
      p_payday_interval: paydayInterval,
    });

    if (error || !rows?.[0]) {
      throw new Error(error?.message || "Failed to read the current cutoff");
    }

    return {
      today: rows[0].today as string,
      cutoffStart: rows[0].cutoff_start as string,
      cutoffEnd: rows[0].cutoff_end as string,
      timezone: rows[0].timezone as string,
    } satisfies HouseholdCutoff;
  });

interface XenditPayoutResponse {
  id?: string;
  /** Present on 2xx. On a replayed Idempotency-key this is the payout's
   *  CURRENT status, which may already be terminal -- see the 2xx branch. */
  status?: string;
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
 *   1. 2xx                 -> adopt the body's own status (normally ACCEPTED/
 *                              REQUESTED -> 'accepted' -> payslip
 *                              'processing'). A replayed key returns the
 *                              original payout with its CURRENT status, so a
 *                              2xx can legitimately mean 'succeeded'.
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

    // Same shared rule the Pay Dial reads, so the manager's estimate and the
    // figures Postgres snapshots cannot drift apart (Session E / E4). Postgres
    // still derives net_pay itself from these two -- it is the authority on the
    // vale total, which it reads under a row lock.
    const paydayInterval = helperRow.payday_interval as PaydayInterval;
    const monthlyRate = Number(helperRow.monthly_rate);
    const { basePay, statutoryEmployeeShare: statutoryShare } = payComponentsForCutoff(
      monthlyRate,
      paydayInterval,
    );

    // The cutoff is NOT passed in any more -- initiate_payslip derives it from
    // the helper's own payday_interval on the Postgres clock, in the
    // household's timezone. Previously the caller computed it here and the
    // double-pay guard was therefore only as trustworthy as this file's
    // arithmetic -- which was timezone-broken, so a wrong cutoff would have
    // sailed straight past payslips_one_per_cutoff under the wrong key. See
    // supabase/add-household-timezone-and-cutoffs.sql.
    const { data: rpcRows, error: rpcError } = await authedClient.rpc("initiate_payslip", {
      p_helper_id: helperId,
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
    const cutoffStart = rpcRows[0].cutoff_start as string;
    const cutoffEnd = rpcRows[0].cutoff_end as string;

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
      const lookup = await lookupXenditPayout(xenditUrl, xenditKey, referenceId);
      const found = lookup.ok ? lookup.payout : null;
      // NOTE: a clean "Xendit has no such payout" is deliberately NOT treated
      // as a definitive failure here, unlike in reconcilePayoutFn. This runs
      // milliseconds after the request went out, so their side may simply not
      // have recorded it yet -- the ambiguity is real. Reconciliation gets to
      // draw the stronger conclusion because minutes have passed by then.
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

    // (2) Xendit accepted (2xx -- 200, not 201; verified 2026-08-17).
    //
    // Trust the body's own status rather than assuming 'accepted'. Normally it
    // is ACCEPTED/REQUESTED and this resolves to 'accepted' exactly as before.
    // It matters when this request was a REPLAY of an Idempotency-key that
    // Xendit already has: an identical payload returns HTTP 200 with the
    // ORIGINAL payout object carrying its CURRENT status (E1 probe 1C), which
    // can already be SUCCEEDED. Recording that as merely 'accepted' would park
    // the payslip in 'processing' waiting for a webhook that has already been
    // and gone. Unknown/absent status falls back to 'accepted', which is the
    // safe reading of a 2xx: Xendit has it, outcome still pending.
    if (response.ok) {
      const reported = attemptStatusFromXendit(body.status) ?? "accepted";
      await recordAttempt(authedClient, attemptId, reported, {
        pspPayoutId: body.id ?? null,
        failureReason:
          reported === "accepted" || reported === "succeeded"
            ? null
            : `Xendit reports ${body.status}`,
      });
      if (reported === "accepted" || reported === "succeeded") {
        return {
          payslipId,
          netPay,
          status: reported === "succeeded" ? ("succeeded" as const) : ("processing" as const),
        };
      }
      // 2xx carrying a terminal FAILED/CANCELLED -- possible only on a replay.
      throw new Error(`Hindi natuloy ang payout — Xendit reports ${body.status}.`);
    }

    // (3) Xendit replied with an error. A duplicate here means this attempt's
    // key was somehow already used -- which should be impossible now that keys
    // are per-attempt and UNIQUE. Treat it as a bug signal, but resolve it the
    // safe way: look the reference up rather than assume.
    // VERIFIED 2026-08-17 (E1 probe 1D): a same-key/different-payload replay
    // returns HTTP 409 with error_code "DUPLICATE_ERROR" and a message naming
    // the idempotency key -- so both halves of this test match, and neither is
    // a guess any more. Keep it a 409-OR-substring test rather than an equality
    // check on the literal: the payouts guide documents the same condition
    // under the name DUPLICATE_PAYOUT_ERROR, so the exact string is not stable
    // across their surfaces. A same-key/IDENTICAL-payload replay never reaches
    // here at all -- that returns 200 and is handled at (2) above.
    const errorText = `${body.error_code ?? ""} ${body.message ?? ""} ${body.errors?.[0]?.message ?? ""}`;
    const isDuplicate = response.status === 409 || /duplicate|idempotency[ -]?key/i.test(errorText);

    if (isDuplicate) {
      const dupLookup = await lookupXenditPayout(xenditUrl, xenditKey, referenceId);
      const found = dupLookup.ok ? dupLookup.payout : null;
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

/**
 * Ask Xendit what actually happened to a payout that has stopped moving, and
 * write the answer back.
 *
 * Session E / E5. Two states can strand a payslip with nothing able to advance
 * it: `pending_send`, where this server function died between creating the row
 * and Xendit's reply (see initiatePayoutFn's two-phase note), and `processing`,
 * where Xendit accepted it but the webhook never arrived -- C44, exactly, where
 * a stale deployment 500'd every callback and the payouts would have sat there
 * forever. Before this, the only fix for either was hand-written SQL.
 *
 * It is the same reconciliation initiatePayoutFn already performs on an
 * ambiguous send, promoted to something a manager can trigger, and it resolves
 * through `record_payout_attempt_result` -- the same function the webhook
 * calls -- so a manual reconciliation and an automatic one cannot reach
 * different conclusions.
 *
 * The one judgement call worth understanding: when Xendit returns cleanly and
 * has NO payout for this reference, that is treated as a definitive failure --
 * the attempt is marked `failed`, which releases the vales and makes the cutoff
 * payable again. That inference is only safe because time has passed (the UI
 * offers this on a stale payout, not a fresh one) and because E1 established
 * that an unknown reference returns 200-with-empty-data rather than an error.
 * A failed LOOKUP is never treated that way -- it throws and changes nothing,
 * because "we couldn't ask" must never be recorded as "it didn't happen".
 */
export const reconcilePayoutFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; payslipId: string }) => data)
  .handler(async ({ data }) => {
    const { token, payslipId } = data;
    const authedClient = createAuthedClient(token);

    // Latest attempt only. Earlier ones are history: their outcome is already
    // recorded and re-resolving them would rewrite it.
    const { data: attempts, error: attemptError } = await authedClient
      .from("payout_attempts")
      .select("id, reference_id, status, attempt_number")
      .eq("payslip_id", payslipId)
      .order("attempt_number", { ascending: false })
      .limit(1);

    const attempt = attempts?.[0];
    if (attemptError || !attempt) {
      throw new Error("No payout attempt found for this payslip.");
    }

    if (["succeeded", "failed", "cancelled"].includes(attempt.status as string)) {
      // Already terminal -- the webhook or an earlier reconciliation got there
      // first. Nothing to do, and saying so beats silently re-writing it.
      return { status: attempt.status as string, changed: false };
    }

    const xenditKey = process.env.XENDIT_SECRET_WRITE_KEY || "";
    const xenditUrl = process.env.XENDIT_API_URL || "https://api.xendit.co";
    if (!xenditKey) {
      throw new Error("XENDIT_SECRET_WRITE_KEY is not configured");
    }

    const lookup = await lookupXenditPayout(xenditUrl, xenditKey, attempt.reference_id as string);

    if (!lookup.ok) {
      // Could not ask. Record nothing: an unanswered question is not an answer.
      throw new Error("Hindi ma-contact ang Xendit ngayon. Subukan ulit mamaya.");
    }

    if (!lookup.payout) {
      // Xendit answered, and has no payout under this reference. Since this is
      // offered only on a payout that has been stuck for minutes, the request
      // never landed -- so the cutoff is genuinely unpaid and must become
      // payable again. record_payout_attempt_result releases the vales.
      await recordAttempt(authedClient, attempt.id as string, "failed", {
        failureReason:
          "Reconciled with Xendit: no payout exists for this reference, so it never reached them.",
      });
      return { status: "failed", changed: true };
    }

    const resolved = attemptStatusFromXendit(lookup.payout.status);
    if (!resolved) {
      throw new Error(
        `Xendit reports an unrecognized status (${lookup.payout.status ?? "none"}). Reconcile in their dashboard.`,
      );
    }

    await recordAttempt(authedClient, attempt.id as string, resolved, {
      pspPayoutId: lookup.payout.id ?? null,
      failureReason:
        resolved === "accepted" || resolved === "succeeded"
          ? null
          : `Reconciled with Xendit: they report ${lookup.payout.status}.`,
    });

    return { status: resolved, changed: resolved !== (attempt.status as string) };
  });
