import { describe, expect, it } from "vitest";

import { manualAckState } from "./payslip-ack";

describe("manualAckState", () => {
  const manual = { payoutProvider: "manual", payoutStatus: "succeeded" as const };

  it("holds an outside-Linara payment as recorded until the helper confirms it", () => {
    expect(manualAckState({ ...manual, helperAck: "pending" })).toBe("recorded");
    expect(manualAckState({ ...manual, helperAck: null })).toBe("recorded");
    expect(manualAckState({ ...manual, helperAck: "disputed" })).toBe("disputed");
    expect(manualAckState({ ...manual, helperAck: "confirmed" })).toBeNull();
  });

  it("leaves Xendit payouts and missing payslips alone", () => {
    expect(
      manualAckState({ payoutProvider: "xendit", payoutStatus: "succeeded", helperAck: null }),
    ).toBeNull();
    expect(manualAckState(null)).toBeNull();
  });
});
