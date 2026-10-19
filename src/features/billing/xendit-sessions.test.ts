import { describe, expect, it, vi } from "vitest";

import { createPaymentSession } from "./xendit-sessions";

const input = {
  referenceId: "LIN-INV-0001",
  amountCentavos: 49900,
  customer: { referenceId: "user-1", email: "maria@example.com", givenNames: "Maria" },
  description: "Linara Home, LIN-INV-0001",
  successUrl: "https://linara.test/billing/return?paid=1",
  cancelUrl: "https://linara.test/billing/return?paid=0",
  expiresAt: "2026-10-20T00:00:00.000Z",
};
const env = { secretKey: "xnd_key", apiUrl: "https://api.xendit.test" };

const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body });

describe("createPaymentSession", () => {
  it("posts the exact body with a Basic header and maps the payment link", async () => {
    const fetchImpl = reply(201, {
      payment_session_id: "ps-1",
      payment_link_url: "https://checkout.xendit.test/ps-1",
      expires_at: "2026-10-20T00:00:00.000Z",
    });
    const out = await createPaymentSession(input, env, fetchImpl);

    expect(out).toEqual({
      sessionId: "ps-1",
      paymentUrl: "https://checkout.xendit.test/ps-1",
      expiresAt: "2026-10-20T00:00:00.000Z",
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.xendit.test/sessions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("xnd_key:").toString("base64")}`);
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      reference_id: "LIN-INV-0001",
      currency: "PHP",
      amount: 499,
      country: "PH",
      session_type: "PAY",
      mode: "PAYMENT_LINK",
      customer: {
        type: "INDIVIDUAL",
        reference_id: "user-1",
        email: "maria@example.com",
        individual_detail: { given_names: "Maria" },
      },
      description: "Linara Home, LIN-INV-0001",
      expires_at: "2026-10-20T00:00:00.000Z",
      success_return_url: "https://linara.test/billing/return?paid=1",
      cancel_return_url: "https://linara.test/billing/return?paid=0",
      notification_channels: ["EMAIL"],
      metadata: { linara: "subscription" },
    });
  });

  it("throws with Xendit's own error code and message on a 400", async () => {
    const fetchImpl = reply(400, { error_code: "API_VALIDATION_ERROR", message: "amount too low" });
    await expect(createPaymentSession(input, env, fetchImpl)).rejects.toThrow(
      "API_VALIDATION_ERROR: amount too low",
    );
  });

  it("throws when a 2xx reply carries no payment link", async () => {
    const fetchImpl = reply(201, { payment_session_id: "ps-1" });
    await expect(createPaymentSession(input, env, fetchImpl)).rejects.toThrow(/payment link/i);
  });

  it("throws a plain message when the error body is not JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    });
    await expect(createPaymentSession(input, env, fetchImpl)).rejects.toThrow(/502/);
  });
});
