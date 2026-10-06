import { describe, expect, it } from "vitest";

import type { Task } from "./task.types";
import {
  byStart,
  durationLabel,
  timeSpan,
  isLaterThanToday,
  isPastDue,
  movedFromLabel,
  taskFormErrors,
  taskWhen,
} from "./task.utils";

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

describe("taskWhen", () => {
  // Local-time instants so the labels hold in any time zone.
  const now = new Date(2026, 8, 30, 22, 0).getTime(); // Wed
  const at = (d: number, h: number, m: number) => ({
    scheduledStart: new Date(2026, 8, d, h, m).toISOString(),
    time: `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`,
  });

  it("shows a bare time for today", () => {
    expect(taskWhen(task(at(30, 19, 30)), now)).toBe("7:30 PM");
  });

  it("adds the weekday for nearby days, before or after", () => {
    expect(taskWhen(task(at(31 + 0, 19, 30)), now)).toBe("Thu 7:30 PM"); // Oct 1
    expect(taskWhen(task(at(25, 19, 30)), now)).toBe("Fri 7:30 PM");
  });

  it("uses the date further out", () => {
    expect(taskWhen(task(at(42, 8, 0)), now)).toBe("Oct 12, 8:00 AM");
  });

  it("falls back to the bare time without a start", () => {
    expect(taskWhen(task({ scheduledStart: undefined }), now)).toBe("7:30 PM");
  });
});

describe("byStart", () => {
  it("orders by real start, not time of day", () => {
    const fri11pm = task({ id: "a", time: "11:00 PM", scheduledStart: "2026-09-25T15:00:00Z" });
    const wed8am = task({ id: "b", time: "8:00 AM", scheduledStart: "2026-09-30T00:00:00Z" });
    const thu7am = task({ id: "c", time: "7:00 AM", scheduledStart: "2026-09-30T23:00:00Z" });
    expect([thu7am, wed8am, fri11pm].sort(byStart).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});

describe("isLaterThanToday", () => {
  const now = new Date(2026, 8, 30, 22, 0).getTime(); // Wed 10 PM, local
  const startingAt = (d: Date) => task({ scheduledStart: d.toISOString() });

  it("keeps today's tasks, early or late, on today", () => {
    expect(isLaterThanToday(startingAt(new Date(2026, 8, 30, 0, 0)), now)).toBe(false);
    expect(isLaterThanToday(startingAt(new Date(2026, 8, 30, 23, 59)), now)).toBe(false);
  });

  it("keeps carried-over tasks on today", () => {
    expect(isLaterThanToday(startingAt(new Date(2026, 8, 25, 19, 30)), now)).toBe(false);
  });

  it("moves anything from midnight onward to later", () => {
    expect(isLaterThanToday(startingAt(new Date(2026, 9, 1, 0, 0)), now)).toBe(true);
  });

  it("treats a task already in progress as today's", () => {
    const early = task({
      status: "in_progress",
      scheduledStart: new Date(2026, 9, 1, 8).toISOString(),
    });
    expect(isLaterThanToday(early, now)).toBe(false);
  });
});

describe("movedFromLabel", () => {
  // Local wall-clock times, so the test holds in any time zone.
  const at = (day: number, h: number) => new Date(2026, 9, day, h, 0).toISOString();

  it("gives just the time when the day didn't change", () => {
    expect(movedFromLabel(at(1, 18), at(1, 20))).toBe("6:00 PM");
  });

  it("adds the weekday when it moved to another day this week", () => {
    // Oct 1, 2026 is a Thursday.
    expect(movedFromLabel(at(1, 18), at(2, 18))).toBe("Thu 6:00 PM");
  });

  it("uses the date when it moved a week or more", () => {
    expect(movedFromLabel(at(1, 18), at(9, 18))).toBe("Oct 1, 6:00 PM");
  });
});

describe("taskFormErrors", () => {
  it("passes a task with a name, day and time", () => {
    expect(taskFormErrors({ title: "Fold laundry", date: "2026-10-02", time: "08:00" })).toEqual(
      {},
    );
  });

  it("names what's missing, and treats a blank title as missing", () => {
    expect(taskFormErrors({ title: "   ", date: "", time: "" })).toEqual({
      title: "Give the task a name.",
      date: "Pick a day.",
      time: "Pick a time.",
    });
  });
});

describe("task length", () => {
  it("names a length the way people say it", () => {
    expect(durationLabel(45)).toBe("45 min");
    expect(durationLabel(60)).toBe("1 hr");
    expect(durationLabel(90)).toBe("1 hr 30 min");
  });

  it("shows a span only when there's a length", () => {
    expect(timeSpan({ time: "2:00 PM" })).toBe("2:00 PM");
    expect(timeSpan({ time: "2:00 PM", durationMinutes: 90 })).toBe("2:00 PM – 3:30 PM");
    expect(timeSpan({ time: "11:30 PM", durationMinutes: 60 })).toBe("11:30 PM – 12:30 AM");
  });
});
