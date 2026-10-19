// src: https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session.md · 2026-10-19
export interface SessionCallback {
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
export function parseSessionCallback(payload: unknown): SessionCallback | null {
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
