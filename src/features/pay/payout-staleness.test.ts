import { describe, expect, it } from "vitest";

import {
  formatAge,
  payoutStaleness,
  PENDING_SEND_STALE_MINUTES,
  PROCESSING_STALE_MINUTES,
} from "./payout-staleness";
import type { Payslip, PayoutStatus } from "./pay.types";

const NOW = Date.parse("2026-08-18T12:00:00Z");

function payslip(status: PayoutStatus, minutesAgo: number): Payslip {
  return {
    id: "p1",
    helperId: "h1",
    cutoffStart: "2026-08-16",
    cutoffEnd: "2026-08-31",
    basePay: 6000,
    statutoryEmployeeShare: 187.5,
    valeDeductions: 0,
    unpaidLeaveDays: 0,
    unpaidLeaveDeduction: 0,
    netPay: 5812.5,
    kind: "regular",
    payoutProvider: "xendit",
    payoutChannelCode: "PH_GCASH",
    payoutStatus: status,
    failureReason: null,
    requestedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
    confirmedAt: null,
    paidOn: null,
    manualNote: null,
    helperAck: null,
    helperAckNote: null,
  };
}

describe("payoutStaleness", () => {
  it("never flags a terminal status", () => {
    // A succeeded or failed payout has an answer; "stuck" is meaningless for
    // it, and needs_review is already the manager's problem by another route.
    for (const status of ["succeeded", "failed", "needs_review"] as const) {
      expect(payoutStaleness(payslip(status, 60 * 24 * 7), NOW).isStale).toBe(false);
    }
  });

  it("gives pending_send a short fuse and processing a long one", () => {
    // The distinction is the point: pending_send means our own process died
    // and nothing will ever move the row, while processing is waiting on a
    // third party that is allowed to be slow.
    expect(payoutStaleness(payslip("pending_send", 5), NOW).isStale).toBe(true);
    expect(payoutStaleness(payslip("processing", 5), NOW).isStale).toBe(false);
  });

  it.each([
    { status: "pending_send" as const, threshold: PENDING_SEND_STALE_MINUTES },
    { status: "processing" as const, threshold: PROCESSING_STALE_MINUTES },
  ])("$status is stale at its threshold, not before", ({ status, threshold }) => {
    expect(payoutStaleness(payslip(status, threshold - 1), NOW).isStale).toBe(false);
    expect(payoutStaleness(payslip(status, threshold), NOW).isStale).toBe(true);
  });

  it("tells a manager to check rather than to re-pay", () => {
    // The dangerous instinct on a stuck payout is "it never went, send it
    // again". pending_send is precisely the case where that may pay twice.
    const advice = payoutStaleness(payslip("pending_send", 30), NOW).advice ?? "";
    expect(advice).toMatch(/check/i);
    expect(advice).not.toMatch(/retry|send it again/i);
  });

  it("clamps clock skew instead of reporting a negative age", () => {
    // Postgres writes requested_at; the browser reads it. If the browser's
    // clock is behind, the row looks like it was requested in the future --
    // which must not read as stale, and must not render "-3m".
    const future = payoutStaleness(payslip("pending_send", -10), NOW);
    expect(future.ageMinutes).toBe(0);
    expect(future.isStale).toBe(false);
  });

  it("survives an unparseable timestamp", () => {
    const broken = { ...payslip("pending_send", 30), requestedAt: "not a date" };
    expect(payoutStaleness(broken, NOW).isStale).toBe(false);
  });
});

describe("formatAge", () => {
  it.each([
    { minutes: 0, expected: "0m" },
    { minutes: 59, expected: "59m" },
    { minutes: 60, expected: "1h" },
    { minutes: 1439, expected: "23h" },
    { minutes: 1440, expected: "1d" },
  ])("$minutes minutes -> $expected", ({ minutes, expected }) => {
    expect(formatAge(minutes)).toBe(expected);
  });
});
