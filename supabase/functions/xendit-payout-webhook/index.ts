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
// a payslip already in a terminal state (succeeded/failed) is a no-op,
// not a re-write, in case the same event is delivered twice.

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

    const { data: payslip, error: fetchError } = await supabase
      .from("payslips")
      .select("id, payout_status")
      .eq("payout_reference_id", referenceId)
      .maybeSingle();

    if (fetchError) {
      console.error("[xendit-payout-webhook] Lookup failed:", fetchError.message);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!payslip) {
      // Ack anyway -- retrying won't make a matching row appear, and this
      // could be a stray/test webhook rather than a real bug.
      console.warn(`[xendit-payout-webhook] No payslip found for reference_id ${referenceId}`);
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (payslip.payout_status === "succeeded" || payslip.payout_status === "failed") {
      console.log(
        `[xendit-payout-webhook] Idempotent no-op for already-terminal payslip ${payslip.id}`,
      );
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const nowIso = new Date().toISOString();

    if (event === "payout.succeeded") {
      const { error: updateError } = await supabase
        .from("payslips")
        .update({
          payout_status: "succeeded",
          payout_external_id: externalId,
          confirmed_at: nowIso,
        })
        .eq("id", payslip.id);

      if (updateError) throw new Error(updateError.message);
    } else if (event === "payout.failed" || event === "payout.reversed") {
      const failureReason = payload.data?.failure_code || `Xendit reported ${event}`;

      const { error: updateError } = await supabase
        .from("payslips")
        .update({
          payout_status: "failed",
          failure_reason: failureReason,
          confirmed_at: nowIso,
        })
        .eq("id", payslip.id);

      if (updateError) throw new Error(updateError.message);

      // Same "give the vales back so the next Pay Now click can claim them"
      // behavior as the immediate-failure path in
      // src/features/pay/pay.actions.ts, for a payout that failed *after*
      // Xendit had already accepted it.
      const { error: unsettleError } = await supabase
        .from("vales")
        .update({ settled_in_payslip_id: null })
        .eq("settled_in_payslip_id", payslip.id);

      if (unsettleError) throw new Error(unsettleError.message);
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
