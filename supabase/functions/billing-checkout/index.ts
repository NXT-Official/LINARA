import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Starts a subscription payment: a plan, or add-ons on the plan the manager
// has (documentation/specs/2026-10-26-subscriptions-plan.md, Phase 4). Called
// by the web's Your plan page with the manager's own token.
//
// The amount is never taken from the browser: billing_create_payment works it
// out from the catalog (supabase/add-billing.sql) and records a pending
// payment. This creates the Xendit invoice for exactly that amount and
// returns its page; Xendit takes GCash, Maya, cards, QR Ph and over the
// counter there. Nothing changes until xendit-billing-webhook hears Xendit
// say it's paid.
//
// Secrets: XENDIT_MONEY_IN_KEY (the subscriptions account's money-in key;
// test mode on dev and staging, live only on prod). SUPABASE_URL,
// SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const XENDIT_API = "https://api.xendit.co";
/** How long the payment page stays open. */
const INVOICE_SECONDS = 24 * 60 * 60;

interface CheckoutRequest {
  kind?: unknown;
  planId?: unknown;
  cycle?: unknown;
  addons?: unknown;
  returnUrl?: unknown;
}

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Where Xendit sends the manager back to: only our own Your plan page, on an
 * origin we serve. Anything else falls back to SITE_URL.
 */
function returnTo(raw: unknown, paymentId: string, outcome: "paid" | "failed"): string | null {
  const allowed = (Deno.env.get("BILLING_RETURN_ORIGINS") ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  let origin: string | null = null;
  if (typeof raw === "string") {
    try {
      const url = new URL(raw);
      const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (
        allowed.includes(url.origin) ||
        (isLocal && Deno.env.get("BILLING_ALLOW_LOCALHOST") === "true")
      ) {
        origin = url.origin;
      }
    } catch {
      // Not a URL: use the default.
    }
  }
  origin ??= allowed[0] ?? null;
  if (!origin) return null;
  return `${origin}/manager/plan?payment=${encodeURIComponent(paymentId)}&result=${outcome}`;
}

/**
 * Closes an open Xendit page so it can't be paid. True once it can't be paid
 * any more (closed now, or already expired); false when it was paid or
 * Xendit couldn't say, so nothing new is opened on top of it.
 */
async function closeInvoice(key: string, invoiceId: string): Promise<boolean> {
  const auth = { Authorization: `Basic ${btoa(`${key}:`)}` };
  const res = await fetch(`${XENDIT_API}/invoices/${encodeURIComponent(invoiceId)}/expire!`, {
    method: "POST",
    headers: auth,
  }).catch(() => null);
  if (res?.ok) return true;
  const check = await fetch(`${XENDIT_API}/v2/invoices/${encodeURIComponent(invoiceId)}`, {
    headers: auth,
  }).catch(() => null);
  const invoice = check?.ok ? await check.json().catch(() => null) : null;
  return invoice?.status === "EXPIRED";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  const moneyInKey = Deno.env.get("XENDIT_MONEY_IN_KEY");
  const url = Deno.env.get("SUPABASE_URL")!;
  if (!moneyInKey) {
    console.error("[billing-checkout] XENDIT_MONEY_IN_KEY is not set");
    return reply(503, { error: "Payments aren't set up yet. Try again later." });
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(401, { error: "Sign in to pay." });
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: user, error: userError } = await userClient.auth.getUser(token);
  if (userError || !user?.user) return reply(401, { error: "Sign in to pay." });

  let body: CheckoutRequest;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: "That request isn't in the right form." });
  }
  const kind = body.kind === "addons" ? "addons" : body.kind === "plan" ? "plan" : null;
  if (!kind) return reply(400, { error: "Unknown payment." });
  const planId = typeof body.planId === "string" ? body.planId : null;
  const cycle = typeof body.cycle === "string" ? body.cycle : null;
  const addons = Array.isArray(body.addons) ? body.addons : [];

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // One open payment per manager (add-billing-idempotency.sql): the same
  // purchase again gets the page that's already open; a different one first
  // closes the open page in Xendit, so two pages can never both be paid.
  let payment: { id: string; amount: number; description?: string } | null = null;
  for (let attempt = 0; attempt < 3 && !payment; attempt++) {
    const { data, error: payError } = await admin.rpc("billing_create_payment", {
      p_manager: user.user.id,
      p_kind: kind,
      p_plan_id: planId,
      p_cycle: cycle,
      p_addons: addons,
    });
    if (payError || !data) {
      // The SQL's own messages are written for the manager ("That's the plan
      // you already have."); anything else stays in the log.
      const message = payError?.message ?? "";
      if (payError?.code === "P0001") return reply(400, { error: message });
      console.error("[billing-checkout] billing_create_payment failed:", message);
      return reply(500, { error: "Couldn't start the payment. Try again." });
    }
    if (data.reuse && data.invoiceUrl) {
      return reply(200, {
        paymentId: data.id,
        amount: data.amount,
        invoiceUrl: data.invoiceUrl,
        reused: true,
      });
    }
    if (data.supersede) {
      const closed = await closeInvoice(moneyInKey, data.supersede.invoiceId);
      if (!closed) {
        return reply(409, {
          // Xendit wouldn't close it: it was paid, and its callback hasn't
          // reached us yet (seen taking 2 minutes on dev).
          error:
            "Your last payment went through on Xendit and is still being confirmed. Give it a minute, then refresh before paying again.",
        });
      }
      await admin.rpc("billing_cancel_payment", { p_payment: data.supersede.id });
      continue;
    }
    payment = data;
  }
  if (!payment) return reply(409, { error: "Couldn't start the payment. Refresh and try again." });

  const success = returnTo(body.returnUrl, payment.id, "paid");
  const failure = returnTo(body.returnUrl, payment.id, "failed");
  const invoiceRes = await fetch(`${XENDIT_API}/v2/invoices`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${moneyInKey}:`)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      external_id: `linara-billing-${payment.id}`,
      // Xendit takes pesos; the payment is whole centavos.
      amount: payment.amount / 100,
      currency: "PHP",
      description: `Linara ${payment.description}`,
      invoice_duration: INVOICE_SECONDS,
      customer: user.user.email ? { email: user.user.email } : undefined,
      ...(success ? { success_redirect_url: success, failure_redirect_url: failure } : {}),
    }),
  });
  const invoice = await invoiceRes.json().catch(() => null);
  if (!invoiceRes.ok || !invoice?.id || !invoice?.invoice_url) {
    console.error(
      `[billing-checkout] Xendit invoice failed (${invoiceRes.status}):`,
      invoice?.error_code ?? "",
      invoice?.message ?? "",
    );
    await admin.rpc("billing_fail_payment", {
      p_payment: payment.id,
      p_reason: "Xendit couldn't open a payment page.",
    });
    return reply(502, {
      error: "The payment page couldn't be opened. Nothing was charged; try again.",
    });
  }

  const { error: attachError } = await admin.rpc("billing_attach_invoice", {
    p_payment: payment.id,
    p_invoice_id: invoice.id,
    p_invoice_url: invoice.invoice_url,
    p_expires_at:
      invoice.expiry_date ?? new Date(Date.now() + INVOICE_SECONDS * 1000).toISOString(),
  });
  if (attachError) {
    // Without the link the webhook can't match it; expire the page so it
    // can't be paid into nothing.
    console.error("[billing-checkout] billing_attach_invoice failed:", attachError.message);
    await fetch(`${XENDIT_API}/invoices/${encodeURIComponent(invoice.id)}/expire!`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${moneyInKey}:`)}` },
    }).catch(() => undefined);
    await admin.rpc("billing_fail_payment", {
      p_payment: payment.id,
      p_reason: "The payment page couldn't be recorded.",
    });
    return reply(500, { error: "Couldn't start the payment. Nothing was charged; try again." });
  }

  return reply(200, {
    paymentId: payment.id,
    amount: payment.amount,
    invoiceUrl: invoice.invoice_url,
  });
});
