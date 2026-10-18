import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseSessionCallback } from "./xendit-callback";

// src: https://docs.xendit.co/apidocs/webhook-notification-sent-defined-webhook-url-updates-payment-session.md · 2026-10-19
const completed = (data: Record<string, unknown> = {}) => ({
  event: "payment_session.completed",
  business_id: "biz_1",
  created: "2026-10-19T03:04:05.000Z",
  data: {
    payment_session_id: "ps_123",
    reference_id: "sub_5b1f2c0e-0000-4000-8000-000000000001_1",
    status: "COMPLETED",
    ...data,
  },
});

describe("parseSessionCallback", () => {
  it("maps a completed session with an amount to PAID and centavos", () => {
    expect(parseSessionCallback(completed({ amount: 697, payment_channel: "GCASH" }))).toEqual({
      externalId: "sub_5b1f2c0e-0000-4000-8000-000000000001_1",
      xenditId: "ps_123",
      status: "PAID",
      paidCentavos: 69700,
      paidAt: "2026-10-19T03:04:05.000Z",
      channel: "GCASH",
    });
  });

  it("rounds fractional pesos to whole centavos", () => {
    expect(parseSessionCallback(completed({ amount: 499.9 }))?.paidCentavos).toBe(49990);
  });

  it("leaves paidCentavos and channel null when the payload omits them", () => {
    const parsed = parseSessionCallback(completed());
    expect(parsed?.paidCentavos).toBeNull();
    expect(parsed?.channel).toBeNull();
  });

  it("falls back to channel_code for the channel", () => {
    expect(parseSessionCallback(completed({ channel_code: "PH_MAYA" }))?.channel).toBe("PH_MAYA");
  });

  it("maps an expired session to EXPIRED", () => {
    const payload = { ...completed(), event: "payment_session.expired" };
    expect(parseSessionCallback(payload)?.status).toBe("EXPIRED");
  });

  it("maps any other event to OTHER", () => {
    const payload = { ...completed(), event: "payment_session.something_new" };
    expect(parseSessionCallback(payload)?.status).toBe("OTHER");
  });

  it("returns null when reference_id or payment_session_id is missing", () => {
    expect(parseSessionCallback({})).toBeNull();
    expect(parseSessionCallback(null)).toBeNull();
    expect(parseSessionCallback("nope")).toBeNull();
    expect(parseSessionCallback(completed({ reference_id: undefined }))).toBeNull();
    expect(parseSessionCallback(completed({ payment_session_id: "" }))).toBeNull();
  });

  it("takes paidAt from data.updated, the moment the session completed, when present", () => {
    expect(parseSessionCallback(completed({ updated: "2026-10-19T02:59:00.000Z" }))?.paidAt).toBe(
      "2026-10-19T02:59:00.000Z",
    );
    expect(parseSessionCallback(completed())?.paidAt).toBe("2026-10-19T03:04:05.000Z");
  });

  it("keeps the edge function's copy of the parser identical", () => {
    const body = (source: string) => {
      const start = source.indexOf("function parseSessionCallback");
      return source.slice(start, source.indexOf("\n}\n", start));
    };
    const web = readFileSync(resolve(__dirname, "xendit-callback.ts"), "utf8");
    const edge = readFileSync(
      resolve(__dirname, "../../../supabase/functions/xendit-session-webhook/index.ts"),
      "utf8",
    );
    expect(body(edge)).toContain(
      "nonEmptyString(data.updated) ?? nonEmptyString(envelope.created)",
    );
    expect(body(edge)).toBe(body(web));
  });

  it("returns a null paidAt when created is absent", () => {
    const { created: _created, ...rest } = completed();
    expect(parseSessionCallback(rest)?.paidAt).toBeNull();
  });
});
