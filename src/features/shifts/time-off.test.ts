import { afterEach, describe, expect, it } from "vitest";

import { statusFor } from "@/features/availability/availability.utils";
import type { LeaveRequest } from "@/features/leave/leave.types";
import type { RestOffRequestRow } from "@/features/ledger/rest-off.actions";
import { setHouseholdTimeZone } from "@/lib/time";

import type { ScheduleStore } from "./hooks/use-schedules";
import {
  approvedTimeOffAt,
  describeTimeOff,
  timeOffFromLeave,
  timeOffFromRestOff,
  timeOffFromShared,
  timeOffWindow,
  type TimeOff,
} from "./time-off";

const row = (over: Partial<RestOffRequestRow>): RestOffRequestRow => ({
  id: "r1",
  helper_id: "h1",
  rest_date: "2026-10-02",
  start_time: "13:00:00",
  end_time: "17:00:00",
  minutes: 240,
  note: null,
  status: "approved",
  decline_reason: null,
  decided_at: null,
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

describe("timeOffFromRestOff", () => {
  it("keeps approved and pending requests, in minutes", () => {
    const list = timeOffFromRestOff([
      row({}),
      row({ id: "r2", status: "pending" }),
      row({ id: "r3", status: "declined" }),
      row({ id: "r4", status: "cancelled" }),
    ]);
    expect(list.map((o) => o.id)).toEqual(["r1", "r2"]);
    expect(list[0]).toMatchObject({ startMin: 780, endMin: 1020 });
    expect(timeOffWindow(list[0])).toBe("1:00 PM – 5:00 PM");
  });
});

describe("approvedTimeOffAt", () => {
  const list = timeOffFromRestOff([
    row({}),
    row({ id: "p", status: "pending", rest_date: "2026-10-03" }),
  ]);

  it("covers [start, end) on that day, for that helper only", () => {
    expect(approvedTimeOffAt(list, "h1", "2026-10-02", 780)).toBeTruthy();
    expect(approvedTimeOffAt(list, "h1", "2026-10-02", 1020)).toBeUndefined();
    expect(approvedTimeOffAt(list, "h2", "2026-10-02", 800)).toBeUndefined();
    expect(approvedTimeOffAt(list, "h1", "2026-10-01", 800)).toBeUndefined();
  });

  it("doesn't count time off that's only been asked for", () => {
    expect(approvedTimeOffAt(list, "h1", "2026-10-03", 800)).toBeUndefined();
  });
});

describe("statusFor with time off", () => {
  afterEach(() => setHouseholdTimeZone(null));
  // Rosa works 8 to 5, rests Sundays.
  const schedules = {
    scheduleFor: () => ({ shiftStart: "08:00", shiftEnd: "17:00", weeklyRestDay: 0 }),
  } as unknown as ScheduleStore;
  const off: TimeOff[] = [
    {
      id: "r1",
      helperId: "h1",
      date: "2026-10-02",
      startMin: 780,
      endMin: 1020,
      status: "approved",
      kind: "rest_off",
    },
  ];
  // Friday Oct 2 2026, 2 PM in Manila.
  const twoPm = Date.parse("2026-10-02T06:00:00Z");

  it("is off mid-shift during approved time off, and says why", () => {
    setHouseholdTimeZone("Asia/Manila");
    expect(statusFor("h1", schedules, twoPm, null, off)).toMatchObject({
      status: "off",
      timeOff: true,
    });
    expect(statusFor("h1", schedules, twoPm, null, []).status).toBe("on_shift");
  });

  it("lets her own Available opt-in win", () => {
    setHouseholdTimeZone("Asia/Manila");
    const manual = { availableUntil: twoPm + 60 * 60_000 };
    expect(statusFor("h1", schedules, twoPm, manual, off).status).toBe("available");
  });
});

describe("leave as time off", () => {
  const leave = (over: Partial<LeaveRequest>): LeaveRequest => ({
    id: "l1",
    helperId: "h1",
    kind: "sil",
    reason: "vacation",
    startDate: "2026-10-05",
    endDate: "2026-10-07",
    days: 3,
    minutes: 0,
    note: null,
    status: "approved",
    declineReason: null,
    helperAck: null,
    helperAckNote: null,
    ...over,
  });

  it("is one whole day per date it covers, and only while live", () => {
    const list = timeOffFromLeave([leave({}), leave({ id: "l2", status: "declined" })]);
    expect(list.map((o) => o.date)).toEqual(["2026-10-05", "2026-10-06", "2026-10-07"]);
    expect(list[0]).toMatchObject({ startMin: 0, endMin: 1440, kind: "sil" });
    expect(approvedTimeOffAt(list, "h1", "2026-10-06", 0)).toBeTruthy();
    expect(approvedTimeOffAt(list, "h1", "2026-10-06", 1439)).toBeTruthy();
  });

  it("says what it is, with or without a name", () => {
    const [sil] = timeOffFromLeave([leave({})]);
    const [asked] = timeOffFromLeave([leave({ kind: "unpaid", status: "pending" })]);
    const [rest] = timeOffFromRestOff([row({})]);
    expect(describeTimeOff(sil, "Rosa")).toBe("Rosa on leave (SIL)");
    expect(describeTimeOff(asked, "Rosa")).toBe("Rosa asked for unpaid leave");
    expect(describeTimeOff(rest, "Rosa")).toBe("Rosa off 1:00 PM – 5:00 PM");
    expect(describeTimeOff(asked)).toBe("Asked for unpaid leave");
  });
});

describe("a shared helper's time off, as another house sees it (O41)", () => {
  const away = timeOffFromShared([
    {
      helper_id: "h1",
      day_from: "2026-10-12",
      day_to: "2026-10-13",
      start_time: null,
      end_time: null,
    },
    {
      helper_id: "h1",
      day_from: "2026-10-15",
      day_to: "2026-10-15",
      start_time: "13:00:00",
      end_time: "17:00:00",
    },
  ]);

  it("is a whole day per day of leave, and the window of rest off", () => {
    expect(away.map((o) => [o.date, o.startMin, o.endMin])).toEqual([
      ["2026-10-12", 0, 1440],
      ["2026-10-13", 0, 1440],
      ["2026-10-15", 780, 1020],
    ]);
    expect(away.every((o) => o.status === "approved" && o.kind === "away")).toBe(true);
  });

  it("counts as off, so the gate and the Pass treat her as away", () => {
    expect(approvedTimeOffAt(away, "h1", "2026-10-13", 600)?.kind).toBe("away");
    expect(approvedTimeOffAt(away, "h1", "2026-10-15", 600)).toBeUndefined();
  });

  it("says she's away without saying what kind of leave", () => {
    expect(describeTimeOff(away[0], "Rosa")).toBe("Rosa on leave");
    expect(describeTimeOff(away[2], "Rosa")).toBe("Rosa off 1:00 PM – 5:00 PM");
  });
});
