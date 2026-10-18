import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Helper } from "@/features/people/people.types";
import type { TimeOff } from "@/features/shifts/time-off";
import { setHouseholdTimeZone } from "@/lib/time";

import {
  firstRoutineDay,
  occurrenceId,
  routinesDueOn,
  routinesFromTickets,
  seriesOf,
  type SeriesRow,
} from "./routine.utils";
import type { Routine } from "./task.types";
import { decodeRecurrence, encodeRecurrence, routineAssignee } from "./task.utils";

beforeEach(() => setHouseholdTimeZone("Asia/Manila"));
afterEach(() => setHouseholdTimeZone(null));

const rosa = { id: "h1", station: "House" } as Helper;

// 7:30 AM in Manila on that day.
const at = (day: string, hm = "07:30") => new Date(`${day}T${hm}:00+08:00`).toISOString();

const row = (over: Partial<SeriesRow> = {}): SeriesRow => ({
  id: "t1",
  title: "Water the plants",
  notes: null,
  helper_id: "h1",
  scheduled_start: at("2026-10-05"),
  recurrence: ["daily"],
  routine_id: "t1",
  suggested: false,
  duration_minutes: null,
  from_household_id: null,
  from_place_id: null,
  to_household_id: null,
  to_place_id: null,
  ...over,
});

describe("encodeRecurrence / decodeRecurrence", () => {
  it("round-trips daily, weekdays and none", () => {
    expect(encodeRecurrence("daily")).toEqual(["daily"]);
    expect(encodeRecurrence(["Mon", "Thu"])).toEqual(["Mon", "Thu"]);
    expect(encodeRecurrence("none")).toBeNull();
    expect(encodeRecurrence(undefined)).toBeNull();
    expect(decodeRecurrence(["daily"])).toBe("daily");
    expect(decodeRecurrence(["Mon", "Thu"])).toEqual(["Mon", "Thu"]);
    expect(decodeRecurrence(null)).toBeUndefined();
    expect(decodeRecurrence([])).toBeUndefined();
  });
});

describe("seriesOf", () => {
  it("is the routine_id, or its own id for a first task from before it was set", () => {
    expect(seriesOf({ id: "t2", routine_id: "t1" })).toBe("t1");
    expect(seriesOf({ id: "t1", routine_id: null })).toBe("t1");
  });
});

describe("routinesFromTickets", () => {
  it("reads one routine per series off its newest task", () => {
    const [r, ...rest] = routinesFromTickets(
      [
        row(),
        row({
          id: "t2",
          scheduled_start: at("2026-10-06", "08:00"),
          title: "Water all the plants",
          notes: "Ferns get a mist",
          duration_minutes: 45,
          to_place_id: "p1",
        }),
      ],
      [rosa],
    );
    expect(rest).toEqual([]);
    expect(r).toMatchObject({
      id: "t1",
      title: "Water all the plants",
      note: "Ferns get a mist",
      helperId: "h1",
      station: "House",
      time: "8:00 AM",
      recurrence: "daily",
      durationMinutes: 45,
      to: { kind: "place", id: "p1" },
      lastDay: "2026-10-06",
    });
  });

  it("goes by the day a task is for, not where it was moved", () => {
    const [r] = routinesFromTickets(
      [
        row({ id: "t2", scheduled_start: at("2026-10-08"), occurrence_date: "2026-10-06" }),
        row({ id: "t3", scheduled_start: at("2026-10-07"), occurrence_date: "2026-10-07" }),
      ],
      [rosa],
    );
    expect(r.lastDay).toBe("2026-10-07");
  });

  it("keeps her as its helper after a day spawned Unassigned", () => {
    const [r] = routinesFromTickets(
      [row(), row({ id: "t2", scheduled_start: at("2026-10-06"), helper_id: null })],
      [rosa],
    );
    expect(r.helperId).toBe("h1");
  });

  it("is Unassigned when no task of it ever had anyone", () => {
    const [r] = routinesFromTickets([row({ helper_id: null })], [rosa]);
    expect(r.helperId).toBeNull();
  });

  it("leaves out a stopped series and a suggestion awaiting approval", () => {
    expect(
      routinesFromTickets(
        [row(), row({ id: "t2", scheduled_start: at("2026-10-06"), recurrence: null })],
        [rosa],
      ),
    ).toEqual([]);
    expect(routinesFromTickets([row({ suggested: true })], [rosa])).toEqual([]);
  });

  it("names a first task from before routine_id was set by its own id", () => {
    const [r] = routinesFromTickets([row({ id: "legacy", routine_id: null })], [rosa]);
    expect(r.id).toBe("legacy");
  });

  it("lists them earliest in the day first", () => {
    const list = routinesFromTickets(
      [
        row({ id: "a", routine_id: "a", scheduled_start: at("2026-10-05", "18:00") }),
        row({ id: "b", routine_id: "b", scheduled_start: at("2026-10-05", "06:00") }),
      ],
      [rosa],
    );
    expect(list.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("routinesDueOn", () => {
  const routine = (over: Partial<Routine> = {}): Routine => ({
    id: "r1",
    title: "Water the plants",
    helperId: "h1",
    station: "House",
    time: "7:30 AM",
    recurrence: "daily",
    lastDay: "2026-10-05",
    ...over,
  });

  it("is due the days after its newest task, on the days it repeats", () => {
    expect(routinesDueOn([routine()], "2026-10-05", [], ["h1"])).toEqual([]);
    expect(routinesDueOn([routine()], "2026-10-06", [], ["h1"])).toHaveLength(1);
    const sheets = routine({ recurrence: ["Mon", "Thu"] });
    expect(routinesDueOn([sheets], "2026-10-07", [], ["h1"])).toEqual([]); // Wednesday
    expect(routinesDueOn([sheets], "2026-10-08", [], ["h1"])).toHaveLength(1); // Thursday
  });

  it("goes to no one while she's away or once she has left", () => {
    const leave: TimeOff = {
      id: "l1:2026-10-06",
      helperId: "h1",
      date: "2026-10-06",
      startMin: 0,
      endMin: 24 * 60,
      status: "approved",
      kind: "sil",
    };
    expect(routinesDueOn([routine()], "2026-10-06", [leave], ["h1"])[0].helperId).toBeNull();
    expect(routinesDueOn([routine()], "2026-10-06", [], ["h2"])[0].helperId).toBeNull();
    expect(routinesDueOn([routine()], "2026-10-06", [], ["h1"])[0].helperId).toBe("h1");
  });
});

describe("routineAssignee", () => {
  it("is no one for an Unassigned routine, whoever is employed", () => {
    expect(routineAssignee({ helperId: null, time: "7:30 AM" }, "2026-10-06", [], ["h1"])).toBe(
      null,
    );
  });

  it("without a roster, only time off counts", () => {
    expect(routineAssignee({ helperId: "h1", time: "7:30 AM" }, "2026-10-06", [])).toBe("h1");
  });
});

describe("firstRoutineDay", () => {
  // 2026-10-07 is a Wednesday.
  it("is today when it repeats today and its time is still ahead", () => {
    expect(firstRoutineDay("daily", "2026-10-07", 6 * 60, "7:30 AM")).toBe("2026-10-07");
  });

  it("is the next day it repeats once today's time has gone", () => {
    expect(firstRoutineDay("daily", "2026-10-07", 9 * 60, "7:30 AM")).toBe("2026-10-08");
    expect(firstRoutineDay(["Mon", "Wed"], "2026-10-07", 9 * 60, "7:30 AM")).toBe("2026-10-12");
  });

  it("skips to the first day of the week it repeats on", () => {
    expect(firstRoutineDay(["Fri"], "2026-10-07", 6 * 60, "7:30 AM")).toBe("2026-10-09");
  });
});

describe("occurrenceId", () => {
  it("is the same for the same series and day, and different otherwise", async () => {
    const a = await occurrenceId("t1", "2026-10-06");
    expect(a).toBe(await occurrenceId("t1", "2026-10-06"));
    expect(a).not.toBe(await occurrenceId("t1", "2026-10-07"));
    expect(a).not.toBe(await occurrenceId("t2", "2026-10-06"));
  });

  it("is shaped like a UUID, so tickets.id takes it", async () => {
    expect(await occurrenceId("t1", "2026-10-06")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
