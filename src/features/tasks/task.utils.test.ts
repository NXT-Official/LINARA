import { describe, expect, it } from "vitest";

import type { Task } from "./task.types";
import { isPastDue, nextWorkdayStart } from "./task.utils";

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  title: "Hang the laundry",
  time: "7:30 PM",
  scheduledStart: "2026-09-30T11:30:00.000Z", // 7:30 PM in Manila
  helperId: "h1",
  station: "House",
  status: "todo",
  ...over,
});

const at = (iso: string) => Date.parse(iso);

describe("isPastDue", () => {
  it("waits out the grace period after the planned start", () => {
    expect(isPastDue(task(), at("2026-09-30T11:59:00Z"))).toBe(false);
    expect(isPastDue(task(), at("2026-09-30T12:00:00Z"))).toBe(true);
  });

  it("still counts a task carried over from an earlier day", () => {
    // Yesterday's 11 PM task is past due at 9 AM today, even though 9 AM < 11 PM.
    const carried = task({ time: "11:00 PM", scheduledStart: "2026-09-29T15:00:00Z" });
    expect(isPastDue(carried, at("2026-09-30T01:00:00Z"))).toBe(true);
  });

  it("ignores anything not waiting to be started", () => {
    const now = at("2026-09-30T15:00:00Z");
    expect(isPastDue(task({ status: "in_progress" }), now)).toBe(false);
    expect(isPastDue(task({ status: "done" }), now)).toBe(false);
    expect(isPastDue(task({ status: "blocked" }), now)).toBe(false);
    expect(isPastDue(task({ queued: true }), now)).toBe(false);
  });

  it("never flags a task without a readable start", () => {
    const now = at("2026-09-30T15:00:00Z");
    expect(isPastDue(task({ scheduledStart: undefined }), now)).toBe(false);
    expect(isPastDue(task({ scheduledStart: "not a date" }), now)).toBe(false);
  });
});

describe("nextWorkdayStart", () => {
  // Built from local dates so the test holds in any time zone.
  const wed = new Date(2026, 8, 30, 21, 0).getTime();

  it("skips the helper's rest day", () => {
    // Rest day Thursday (4) -> Friday.
    const next = nextWorkdayStart(task(), wed, {
      shiftStart: "08:00",
      shiftEnd: "20:00",
      weeklyRestDay: 4,
    });
    expect(next.weekday).toBe("Fri");
    const d = new Date(next.iso);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2, 19, 30]);
  });

  it("falls back to tomorrow without a schedule", () => {
    expect(nextWorkdayStart(task(), wed, undefined).weekday).toBe("Thu");
  });
});
