import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public receiver for Xendit Payment Session webhooks (platform subscription
// invoices). Like xendit-payout-webhook it authenticates the CALLER via the
// x-callback-token header, not a user JWT, so config.toml sets verify_jwt =
// false. Writes go through the service-role-only RPC
// billing_record_invoice_result, which is idempotent: Xendit retries an
// unacknowledged webhook up to six times over 24 h, so any 2xx once the RPC
// ran is correct, including when it reports applied:false.
// src: https://docs.xendit.co/docs/handling-webhooks.md · 2026-10-19

// mirrors src/features/billing/xendit-callback.ts
// src: https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session.md · 2026-10-19
interface SessionCallback {
  externalId: string;
  xenditId: string;
  status: "PAID" | "EXPIRED" | "OTHER";
  paidCentavos: number | null;
  paidAt: string | null;
  channel: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const nonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/** Parses a Xendit Payment Session webhook body; null when it names no invoice. */
function parseSessionCallback(payload: unknown): SessionCallback | null {
  const envelope = asRecord(payload);
  const data = asRecord(envelope?.data);
  if (!envelope || !data) return null;

  const externalId = nonEmptyString(data.reference_id);
  const xenditId = nonEmptyString(data.payment_session_id);
  if (!externalId || !xenditId) return null;

  const event = envelope.event;
  const status =
    event === "payment_session.completed"
      ? "PAID"
      : event === "payment_session.expired"
        ? "EXPIRED"
        : "OTHER";

  // amount is optional in the payload; null means "as invoiced".
  const paidCentavos =
    typeof data.amount === "number" && Number.isFinite(data.amount)
      ? Math.round(data.amount * 100)
      : null;

  return {
    externalId,
    xenditId,
    status,
    paidCentavos,
    // When the session changed state (data.updated), else when the event was sent.
    paidAt: nonEmptyString(data.updated) ?? nonEmptyString(envelope.created),
    channel: nonEmptyString(data.payment_channel) ?? nonEmptyString(data.channel_code),
  };
}

const json = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const expectedToken = Deno.env.get("XENDIT_WEBHOOK_VERIFICATION_TOKEN");
  const receivedToken = req.headers.get("x-callback-token");
  if (!expectedToken || receivedToken !== expectedToken) {
    console.error("[xendit-session-webhook] Rejected: missing or mismatched x-callback-token");
    return json(401, { error: "Unauthorized" });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    console.warn("[xendit-session-webhook] Ignoring body that is not JSON");
    return json(200, { received: true });
  }

  const callback = parseSessionCallback(payload);
  if (!callback) {
    console.warn("[xendit-session-webhook] Ignoring body without reference_id/payment_session_id");
    return json(200, { received: true });
  }

  // The RPC knows PAID and EXPIRED; any other event is acknowledged unwritten.
  if (callback.status === "OTHER") {
    console.log("[xendit-session-webhook] Ignoring event that is neither completed nor expired");
    return json(200, { received: true });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase.rpc("billing_record_invoice_result", {
    p_external_id: callback.externalId,
    p_xendit_id: callback.xenditId,
    p_status: callback.status,
    p_paid_centavos: callback.paidCentavos,
    p_paid_at: callback.paidAt,
    p_channel: callback.channel,
    p_raw: payload,
  });

  if (error) {
    console.error("[xendit-session-webhook] billing_record_invoice_result failed:", error.message);
    return json(500, { error: "Could not record the invoice result" });
  }

  const applied = (data as { applied?: boolean } | null)?.applied === true;
  return json(200, { received: true, applied });
});
