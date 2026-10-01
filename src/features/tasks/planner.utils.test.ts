import { afterEach, describe, expect, it } from "vitest";

import { setHouseholdTimeZone, toISODate } from "@/lib/time";

import {
  groupByDay,
  isMovable,
  planDays,
  planLabel,
  startOfWeek,
  stepAnchor,
} from "./planner.utils";
import type { Task } from "./task.types";

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
