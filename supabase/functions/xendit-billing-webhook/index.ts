import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Xendit's invoice callbacks for subscription payments (billing-checkout).
// Separate from xendit-payout-webhook: subscriptions use their own Xendit
// account, so the caller is checked against that account's token,
// XENDIT_BILLING_WEBHOOK_TOKEN, sent in X-CALLBACK-TOKEN. verify_jwt is off
// for it in config.toml (Xendit has no Supabase session).
//
// The callback body is not trusted beyond its invoice id: the invoice is read
// back from Xendit with XENDIT_READ_KEY, and that is what
// billing_apply_invoice applies (supabase/add-billing.sql). It logs each
// invoice and status once and applies a payment once, so Xendit's retries
// and a replayed callback change nothing.
//
// Replies 200 for anything handled or deliberately ignored (so Xendit stops
// retrying), 401 for a wrong token, 500 when it couldn't be applied (so
// Xendit retries; C44 is what a silent failure here costs).

const XENDIT_API = "https://api.xendit.co";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Compares without leaking where the strings differ. */
function sameToken(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const expected = Deno.env.get("XENDIT_BILLING_WEBHOOK_TOKEN") ?? "";
  const received = req.headers.get("x-callback-token") ?? "";
  if (!expected || !sameToken(received, expected)) {
    console.error("[xendit-billing-webhook] Rejected: missing or mismatched X-CALLBACK-TOKEN");
    return json(401, { error: "Unauthorized" });
  }

  let payload: { id?: unknown; external_id?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Not JSON" });
  }
  const invoiceId = typeof payload.id === "string" ? payload.id : "";
  const externalId = typeof payload.external_id === "string" ? payload.external_id : "";
  // Only our subscription invoices; Xendit's "test" button and anything else
  // on the account is acknowledged without a write.
  if (!invoiceId || !externalId.startsWith("linara-billing-")) {
    console.log(`[xendit-billing-webhook] Ignoring callback for ${externalId || "no external_id"}`);
    return json(200, { received: true, ignored: true });
  }

  const readKey = Deno.env.get("XENDIT_READ_KEY") ?? Deno.env.get("XENDIT_MONEY_IN_KEY");
  if (!readKey) {
    console.error("[xendit-billing-webhook] XENDIT_READ_KEY is not set");
    return json(500, { error: "Not configured" });
  }
  const res = await fetch(`${XENDIT_API}/v2/invoices/${encodeURIComponent(invoiceId)}`, {
    headers: { Authorization: `Basic ${btoa(`${readKey}:`)}` },
  });
  if (res.status === 404) {
    console.warn(`[xendit-billing-webhook] Xendit doesn't know invoice ${invoiceId}`);
    return json(200, { received: true, ignored: true });
  }
  const invoice = await res.json().catch(() => null);
  if (!res.ok || !invoice?.id || invoice.id !== invoiceId || invoice.external_id !== externalId) {
    console.error(
      `[xendit-billing-webhook] Couldn't read invoice ${invoiceId} back (${res.status})`,
    );
    return json(500, { error: "Couldn't confirm the invoice" });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: outcome, error } = await admin.rpc("billing_apply_invoice", {
    p_invoice: {
      id: invoice.id,
      external_id: invoice.external_id,
      status: invoice.status,
      amount: invoice.amount,
      paid_amount: invoice.paid_amount,
      currency: invoice.currency,
      paid_at: invoice.paid_at,
      payment_method: invoice.payment_method,
      payment_channel: invoice.payment_channel,
    },
  });
  if (error) {
    console.error(
      `[xendit-billing-webhook] billing_apply_invoice failed for ${invoiceId}:`,
      error.message,
    );
    return json(500, { error: "Couldn't apply it" });
  }
  console.log(`[xendit-billing-webhook] ${invoiceId} ${invoice.status}: ${outcome}`);
  if (outcome === "review") {
    console.error(`[xendit-billing-webhook] ${invoiceId} needs review in the console`);
  }
  return json(200, { received: true, outcome });
});
