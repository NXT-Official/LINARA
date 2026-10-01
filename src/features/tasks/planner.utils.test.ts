import { afterEach, describe, expect, it } from "vitest";

import { setHouseholdTimeZone, toISODate } from "@/lib/time";

import {
  groupByDay,
  isMovable,
  isOutsideShift,
  routineGhosts,
  planDays,
  planLabel,
  startOfWeek,
  taskTone,
  stepAnchor,
} from "./planner.utils";
import type { TimeOff } from "@/features/shifts/time-off";

import type { Routine, Task } from "./task.types";

const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const isos = (days: Date[]) => days.map(toISODate);

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

afterEach(() => setHouseholdTimeZone(null));

describe("weeks", () => {
  it("start on Monday, Sunday included", () => {
    expect(toISODate(startOfWeek(day("2026-10-01")))).toBe("2026-09-28"); // Thu
    expect(toISODate(startOfWeek(day("2026-10-04")))).toBe("2026-09-28"); // Sun
    expect(toISODate(startOfWeek(day("2026-09-28")))).toBe("2026-09-28"); // Mon
  });

  it("show seven days across a month boundary", () => {
    expect(isos(planDays("week", day("2026-10-01")))).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(planLabel("week", day("2026-10-01"))).toBe("Sep 28 – Oct 4");
  });

  it("step a week at a time", () => {
    expect(toISODate(stepAnchor("week", day("2026-10-01"), 1))).toBe("2026-10-08");
    expect(toISODate(stepAnchor("week", day("2026-10-01"), -1))).toBe("2026-09-24");
  });
});

describe("months", () => {
  it("cover every whole week the month touches", () => {
    // October 2026: Thu the 1st to Sat the 31st.
    const days = planDays("month", day("2026-10-15"));
    expect(days).toHaveLength(35);
    expect(toISODate(days[0])).toBe("2026-09-28");
    expect(toISODate(days[days.length - 1])).toBe("2026-11-01");
    expect(planLabel("month", day("2026-10-15"))).toBe("October 2026");
  });

  it("need no extra week when the month starts on a Monday", () => {
    // February 2027: Mon the 1st to Sun the 28th, exactly four weeks.
    const days = planDays("month", day("2027-02-10"));
    expect(days).toHaveLength(28);
    expect(toISODate(days[0])).toBe("2027-02-01");
  });

  it("step to the 1st of the next or previous month", () => {
    expect(toISODate(stepAnchor("month", day("2026-01-31"), 1))).toBe("2026-02-01");
    expect(toISODate(stepAnchor("month", day("2026-01-31"), -1))).toBe("2025-12-01");
  });
});

describe("groupByDay", () => {
  it("files a task under the household's day, not the device's", () => {
    setHouseholdTimeZone("Asia/Manila");
    // 11:30 PM Sep 30 in Manila is still Sep 30 there, wherever the manager is.
    const late = task({ id: "late", time: "11:30 PM", scheduledStart: "2026-09-30T15:30:00Z" });
    // 12:30 AM Oct 1 in Manila is Sep 30 in UTC, but Oct 1 in the house.
    const early = task({ id: "early", time: "12:30 AM", scheduledStart: "2026-09-30T16:30:00Z" });
    const byDay = groupByDay([early, late]);
    expect(byDay.get("2026-09-30")?.map((t) => t.id)).toEqual(["late"]);
    expect(byDay.get("2026-10-01")?.map((t) => t.id)).toEqual(["early"]);
  });

  it("puts each day in time order", () => {
    setHouseholdTimeZone("Asia/Manila");
    const evening = task({ id: "evening" });
    const morning = task({
      id: "morning",
      time: "8:00 AM",
      scheduledStart: "2026-09-30T00:00:00Z",
    });
    expect(
      groupByDay([evening, morning])
        .get("2026-09-30")
        ?.map((t) => t.id),
    ).toEqual(["morning", "evening"]);
  });

  it("skips a task with no start", () => {
    expect(groupByDay([task({ scheduledStart: undefined })]).size).toBe(0);
  });
});

describe("isMovable", () => {
  it("lets a waiting or held task move, not one that has started", () => {
    expect(isMovable(task())).toBe(true);
    expect(isMovable(task({ status: "blocked" }))).toBe(true);
    expect(isMovable(task({ status: "in_progress" }))).toBe(false);
    expect(isMovable(task({ status: "done" }))).toBe(false);
  });
});

describe("routineGhosts", () => {
  const routine = (over: Partial<Routine> = {}): Routine => ({
    id: "r1",
    title: "Water the plants",
    helperId: "h1",
    station: "House",
    time: "7:00 AM",
    recurrence: ["Mon", "Wed"],
    ...over,
  });
  const week = planDays("week", day("2026-09-30"));

  it("puts a routine on its matching days after today only", () => {
    const ghosts = routineGhosts([routine()], week, "2026-09-28", [], ["h1"]);
    expect([...ghosts.keys()]).toEqual(["2026-09-30"]);
  });

  it("leaves out a helper who has left", () => {
    expect(routineGhosts([routine()], week, "2026-09-27", [], ["h2"]).size).toBe(0);
  });

  it("goes to Unassigned while its helper has approved time off then", () => {
    const off = (over: Partial<TimeOff> = {}): TimeOff => ({
      id: "l1:2026-09-30",
      helperId: "h1",
      date: "2026-09-30",
      startMin: 0,
      endMin: 24 * 60,
      status: "approved",
      kind: "sil",
      ...over,
    });
    const on = (list: TimeOff[]) =>
      routineGhosts([routine()], week, "2026-09-27", [], ["h1"], list).get("2026-09-30")?.[0]
        .helperId;
    expect(on([])).toBe("h1");
    expect(on([off()])).toBeNull();
    // Only approved time off, and only when it covers the routine's time.
    expect(on([off({ status: "pending" })])).toBe("h1");
    expect(on([off({ kind: "rest_off", startMin: 13 * 60, endMin: 17 * 60 })])).toBe("h1");
    expect(on([off({ kind: "rest_off", startMin: 6 * 60, endMin: 8 * 60 })])).toBeNull();
  });
});

describe("isOutsideShift", () => {
  const schedule = { shiftStart: "08:00", shiftEnd: "17:00", weeklyRestDay: 0 };
  afterEach(() => setHouseholdTimeZone(null));

  it("is false inside the shift and true after it, or for nobody's task", () => {
    setHouseholdTimeZone("Asia/Manila");
    expect(
      isOutsideShift(
        task({ time: "9:00 AM", scheduledStart: "2026-09-30T01:00:00.000Z" }),
        schedule,
      ),
    ).toBe(false);
    expect(isOutsideShift(task(), schedule)).toBe(true); // 7:30 PM
    expect(isOutsideShift(task({ helperId: null }), schedule)).toBe(false);
  });
});

describe("taskTone", () => {
  // The task fixture is due 7:30 PM Sep 30 in Manila (11:30 UTC).
  const before = Date.parse("2026-09-30T11:00:00Z");
  const after = Date.parse("2026-09-30T13:00:00Z");

  it("is late only once a to-do task is past its time and grace", () => {
    expect(taskTone(task(), before)).toBe("planned");
    expect(taskTone(task(), after)).toBe("late");
  });

  it("follows the status otherwise, whatever the time", () => {
    expect(taskTone(task({ status: "blocked" }), after)).toBe("held");
    expect(taskTone(task({ status: "in_progress" }), after)).toBe("doing");
    expect(taskTone(task({ status: "done" }), after)).toBe("done");
  });
});
