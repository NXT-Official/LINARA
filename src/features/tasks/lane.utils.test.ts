import { describe, expect, it } from "vitest";

import { attentionRank, lanePill, laneSummary } from "./lane.utils";
import type { Task } from "./task.types";

const task = (over: Partial<Task>): Task => ({
  id: "t1",
  title: "Hang the laundry",
  time: "7:30 PM",
  scheduledStart: "2026-09-30T11:30:00.000Z", // 7:30 PM in Manila
  helperId: "h1",
  station: "House",
  status: "todo",
  ...over,
});
const before = Date.parse("2026-09-30T08:00:00Z");
const after = Date.parse("2026-09-30T13:00:00Z");

describe("laneSummary", () => {
  it("counts the day and finds what's now and next", () => {
    const s = laneSummary(
      [
        task({ id: "a", status: "done", scheduledStart: "2026-09-30T01:00:00Z" }),
        task({ id: "b", scheduledStart: "2026-09-30T09:00:00Z" }),
        task({ id: "c" }),
      ],
      before,
    );
    expect([s.done, s.total]).toEqual([1, 3]);
    expect(s.nowTask?.id).toBe("b");
    expect(s.nextTask?.id).toBe("c");
  });

  it("marks past-due and blocked tasks as needing the manager", () => {
    const s = laneSummary([task({ id: "late" }), task({ id: "stuck", status: "blocked" })], after);
    expect([...s.overdueIds].sort()).toEqual(["late", "stuck"]);
    expect(lanePill(s).text).toBe("2 need you");
    expect(attentionRank(s)).toBe(0);
  });
});

describe("lanePill", () => {
  it("says what she's on, all done, or nothing today", () => {
    expect(lanePill(laneSummary([task({ status: "in_progress" })], before)).text).toBe(
      "Now: Hang the laundry",
    );
    expect(lanePill(laneSummary([task({ status: "done" })], before)).text).toBe("All done");
    expect(lanePill(laneSummary([], before)).text).toBe("Nothing today");
  });
});
