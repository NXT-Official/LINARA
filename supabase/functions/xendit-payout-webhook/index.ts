import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Closes KNOWN_GAPS.md gap #9's webhook half. Unlike this repo's other Edge
// Functions (generate-sop/route-utos/parse-scheduler/transcribe-notes/
// promote-voice-task), this one is never called by the client -- it's the
// public receiver Xendit calls back on, so it has no CORS surface to serve
// (no browser ever hits it directly) and authenticates the *caller*
// (Xendit) instead of a user JWT, via the X-CALLBACK-TOKEN header
// (docs.xendit.co) checked against XENDIT_WEBHOOK_VERIFICATION_TOKEN --
// set with `supabase secrets set`, paired with the same value entered into
// Xendit's dashboard webhook settings. Writes with the service-role key
// (auto-injected as SUPABASE_SERVICE_ROLE_KEY in every Edge Function),
// bypassing payslips_isolation entirely -- there is no household-scoped
// user session here to check RLS against, same posture as every other
// service-role write in this repo's webhook-shaped functions.
//
// Xendit retries an unacknowledged webhook for 24h, so idempotency matters:
// an attempt already in a terminal state (succeeded/failed/cancelled) is a
// no-op, not a re-write, in case the same event is delivered twice.
//
// As of supabase/add-payout-attempts.sql this resolves the incoming
// reference_id against public.payout_attempts (one row per Xendit call, each
// with its own reference id) rather than against payslips.payout_reference_id,
// which no longer exists. The attempt -> payslip rollup and the vale release
// are delegated to record_payout_attempt_result so this function and the web
// caller can't implement that mapping differently.

interface XenditPayoutWebhookPayload {
  event?: string;
  data?: {
    id?: string;
    reference_id?: string;
    status?: string;
    failure_code?: string;
  };
}

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const expectedToken = Deno.env.get("XENDIT_WEBHOOK_VERIFICATION_TOKEN");
  const receivedToken = req.headers.get("x-callback-token");

  if (!expectedToken || receivedToken !== expectedToken) {
    console.error("[xendit-payout-webhook] Rejected: missing or mismatched X-CALLBACK-TOKEN");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const payload: XenditPayoutWebhookPayload = await req.json();
    const event = payload.event ?? "";
    const referenceId = payload.data?.reference_id;
    const externalId = payload.data?.id;

    // Only payout.* events carry a payslip-shaped payload; ack anything else
    // (e.g. a misconfigured webhook subscription) without writing.
    if (!event.startsWith("payout.") || !referenceId) {
      console.log(`[xendit-payout-webhook] Ignoring unhandled event: ${event}`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // reference_id now identifies a single ATTEMPT, not the payslip -- each
    // Xendit call gets its own (supabase/add-payout-attempts.sql). That's what
    // makes this lookup unambiguous: under the old per-cutoff reference id, a
    // retried payout would have produced two rows sharing one id.
    const { data: attempt, error: fetchError } = await supabase
      .from("payout_attempts")
      .select("id, status, payslip_id")
      .eq("reference_id", referenceId)
      .maybeSingle();

    if (fetchError) {
      console.error("[xendit-payout-webhook] Lookup failed:", fetchError.message);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!attempt) {
      // Ack anyway -- retrying won't make a matching row appear, and this
      // could be a stray/test webhook rather than a real bug.
      console.warn(`[xendit-payout-webhook] No attempt found for reference_id ${referenceId}`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Xendit retries an unacknowledged webhook for 24h, so a redelivery of an
    // already-terminal attempt must be a no-op rather than a re-write.
    if (
      attempt.status === "succeeded" ||
      attempt.status === "failed" ||
      attempt.status === "cancelled"
    ) {
      console.log(
        `[xendit-payout-webhook] Idempotent no-op for already-terminal attempt ${attempt.id}`,
      );
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Map the event, then let record_payout_attempt_result do the rollup to
    // payslips AND the vale release in one transaction -- so this function
    // can't leave the attempt and the payslip disagreeing, and the
    // failed-vs-ambiguous vale rule lives in exactly one place.
    let attemptStatus: string | null = null;
    let failureReason: string | null = null;

    if (event === "payout.succeeded") {
      attemptStatus = "succeeded";
    } else if (event === "payout.failed") {
      attemptStatus = "failed";
      failureReason = payload.data?.failure_code || `Xendit reported ${event}`;
    } else if (event === "payout.reversed" || event === "payout.cancelled") {
      attemptStatus = "cancelled";
      failureReason = payload.data?.failure_code || `Xendit reported ${event}`;
    }

    if (attemptStatus) {
      const { error: rpcError } = await supabase.rpc("record_payout_attempt_result", {
        p_attempt_id: attempt.id,
        p_status: attemptStatus,
        p_psp_payout_id: externalId ?? null,
        p_failure_reason: failureReason,
      });

      if (rpcError) throw new Error(rpcError.message);
    } else {
      console.log(`[xendit-payout-webhook] Ignoring intermediate event: ${event}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[xendit-payout-webhook] Fatal error processing webhook:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
