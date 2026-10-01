import { describe, expect, it } from "vitest";

import {
  deadFromReceipts,
  receiptIdsToCheck,
  settleTickets,
  toStoredTokens,
  type StoredToken,
} from "./push.utils";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const tok = (token: string, lastTicketId: string | null, hoursAgo: number | null): StoredToken => ({
  token,
  lastTicketId,
  lastSentAt: hoursAgo === null ? null : new Date(NOW - hoursAgo * 3_600_000).toISOString(),
});

describe("toStoredTokens", () => {
  it("reads the old bare-string shape and the new row shape", () => {
    expect(
      toStoredTokens([
        "ExponentPushToken[a]",
        {
          token: "ExponentPushToken[b]",
          last_ticket_id: "t1",
          last_sent_at: "2026-10-01T00:00:00Z",
        },
        { nope: 1 },
      ]),
    ).toEqual([
      { token: "ExponentPushToken[a]", lastTicketId: null, lastSentAt: null },
      { token: "ExponentPushToken[b]", lastTicketId: "t1", lastSentAt: "2026-10-01T00:00:00Z" },
    ]);
  });
});

describe("receiptIdsToCheck", () => {
  it("asks only about tickets young enough to still have a receipt", () => {
    expect(
      receiptIdsToCheck([tok("a", "t1", 1), tok("b", "t2", 30), tok("c", null, null)], NOW),
    ).toEqual(["t1"]);
  });
});

describe("deadFromReceipts", () => {
  it("picks tokens whose last push came back DeviceNotRegistered", () => {
    const tokens = [tok("a", "t1", 1), tok("b", "t2", 1), tok("c", "t3", 1)];
    expect(
      deadFromReceipts(tokens, {
        t1: { status: "error", details: { error: "DeviceNotRegistered" } },
        t2: { status: "error", details: { error: "MessageRateExceeded" } },
        t3: { status: "ok" },
      }),
    ).toEqual(["a"]);
  });
});

describe("settleTickets", () => {
  it("pairs tickets with tokens by position", () => {
    expect(
      settleTickets(
        ["a", "b", "c"],
        [
          { status: "ok", id: "t1" },
          { status: "error", details: { error: "DeviceNotRegistered" } },
          { status: "error", details: { error: "MessageTooBig" } },
        ],
      ),
    ).toEqual({ dead: ["b"], sent: [{ token: "a", ticketId: "t1" }] });
  });

  it("handles a failed request with no tickets", () => {
    expect(settleTickets(["a"], [])).toEqual({ dead: [], sent: [] });
  });
});
