import { describe, expect, it } from "vitest";

import type { SupportThread } from "./support.types";
import { sortThreads } from "./support.utils";

const thread = (over: Partial<SupportThread>): SupportThread => ({
  id: "t",
  ref: 1,
  subject: "S",
  status: "open",
  createdAt: "2026-10-01T00:00:00Z",
  lastMessageAt: "2026-10-01T00:00:00Z",
  householdUnread: 0,
  ...over,
});

describe("sortThreads", () => {
  it("puts unread first, then the most recent line", () => {
    const sorted = sortThreads([
      thread({ id: "old", lastMessageAt: "2026-10-02T00:00:00Z" }),
      thread({ id: "new", lastMessageAt: "2026-10-05T00:00:00Z" }),
      thread({ id: "unread", lastMessageAt: "2026-10-01T00:00:00Z", householdUnread: 1 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["unread", "new", "old"]);
  });

  it("falls back to createdAt for a thread with no line yet", () => {
    const sorted = sortThreads([
      thread({ id: "a", lastMessageAt: "2026-10-03T00:00:00Z" }),
      thread({ id: "empty", lastMessageAt: null, createdAt: "2026-10-09T00:00:00Z" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["empty", "a"]);
  });
});
