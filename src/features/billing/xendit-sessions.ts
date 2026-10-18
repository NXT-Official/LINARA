export type PaymentSessionInput = {
  referenceId: string;
  amountCentavos: number;
  customer: { referenceId: string; email: string; givenNames: string };
  description: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: string;
};

export type PaymentSession = { sessionId: string; paymentUrl: string; expiresAt: string };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const text = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/**
 * Creates a Xendit Payment Session in PAYMENT_LINK mode: a hosted page the
 * household pays on. `referenceId` is our invoice's external_id, which the
 * webhook (xendit-callback.ts) sends back to find the invoice.
 * Amounts: Xendit takes major units (pesos); ours are centavos.
 */
export async function createPaymentSession(
  input: PaymentSessionInput,
  env: { secretKey: string; apiUrl: string },
  fetchImpl: typeof fetch = fetch,
): Promise<PaymentSession> {
  // src: https://docs.xendit.co/apidocs/create-session.md · Payment Sessions · 2026-10-19
  const response = await fetchImpl(`${env.apiUrl}/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.secretKey}:`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reference_id: input.referenceId,
      currency: "PHP",
      amount: input.amountCentavos / 100,
      country: "PH",
      session_type: "PAY",
      mode: "PAYMENT_LINK",
      customer: {
        type: "INDIVIDUAL",
        reference_id: input.customer.referenceId,
        email: input.customer.email,
        individual_detail: { given_names: input.customer.givenNames },
      },
      description: input.description,
      expires_at: input.expiresAt,
      success_return_url: input.successUrl,
      cancel_return_url: input.cancelUrl,
      notification_channels: ["EMAIL"],
      metadata: { linara: "subscription" },
    }),
  });

  const body = asRecord(await response.json().catch(() => null));

  if (!response.ok) {
    const code = text(body?.error_code);
    const message = text(body?.message);
    throw new Error(
      code || message
        ? `${code ?? "XENDIT_ERROR"}: ${message ?? "no message"}`
        : `Xendit answered ${response.status}`,
    );
  }

  const sessionId = text(body?.payment_session_id);
  const paymentUrl = text(body?.payment_link_url);
  if (!sessionId || !paymentUrl) throw new Error("Xendit's reply had no payment link");

  return { sessionId, paymentUrl, expiresAt: text(body?.expires_at) ?? input.expiresAt };
}
