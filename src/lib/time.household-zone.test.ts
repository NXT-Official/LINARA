import { afterEach, describe, expect, it } from "vitest";

import {
  combineDateAndTime,
  formatTimeOfDay,
  fromHouseholdClock,
  householdDayStamp,
  isoToDisplayTime,
  isoToISODate,
  setHouseholdTimeZone,
  startOfDayIso,
  toHouseholdClock,
  toISODate,
  weekdayOf,
} from "./time";

/**
 * KNOWN_GAPS.md O9: wall-clock times are the household's. Each case runs on
 * devices in three zones -- the house's own, one far ahead, one far behind --
 * and must come out the same on all of them.
 */
const DEVICE_ZONES = ["Asia/Manila", "Asia/Dubai", "America/Los_Angeles"] as const;

function onDevice<T>(tz: string, fn: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    process.env.TZ = previous;
  }
}

afterEach(() => setHouseholdTimeZone(null));

describe.each(DEVICE_ZONES)("a Manila household, read on a device in %s", (device) => {
  it("stores 7:30 PM as 7:30 PM Manila time", () => {
    onDevice(device, () => {
      setHouseholdTimeZone("Asia/Manila");
      expect(combineDateAndTime("2026-10-01", "7:30 PM")).toBe("2026-10-01T11:30:00.000Z");
    });
  });

  it("shows a stored task at the house's time and on the house's day", () => {
    onDevice(device, () => {
      setHouseholdTimeZone("Asia/Manila");
      // 23:30 Manila on Oct 1 is Oct 1 15:30 UTC -- still Oct 1 in the house.
      expect(isoToDisplayTime("2026-10-01T15:30:00.000Z")).toBe("11:30 PM");
      expect(isoToISODate("2026-10-01T15:30:00.000Z")).toBe("2026-10-01");
      // 00:30 Manila on Oct 2 -- Oct 1 in Dubai and Los Angeles, Oct 2 in the house.
      expect(isoToISODate("2026-10-01T16:30:00.000Z")).toBe("2026-10-02");
      expect(formatTimeOfDay(Date.parse("2026-10-01T16:30:00.000Z"))).toBe("12:30 AM");
    });
  });

  it("round-trips a date and time", () => {
    onDevice(device, () => {
      setHouseholdTimeZone("Asia/Manila");
      const iso = combineDateAndTime("2026-12-31", "11:45 PM");
      expect(isoToISODate(iso)).toBe("2026-12-31");
      expect(isoToDisplayTime(iso)).toBe("11:45 PM");
    });
  });

  it("starts the board's day at the house's midnight", () => {
    onDevice(device, () => {
      setHouseholdTimeZone("Asia/Manila");
      expect(startOfDayIso(new Date(2026, 9, 1))).toBe("2026-09-30T16:00:00.000Z");
    });
  });

  it("reads the house's weekday", () => {
    onDevice(device, () => {
      setHouseholdTimeZone("Asia/Manila");
      // Sat Oct 3 00:30 in Manila; still Friday in Dubai and Los Angeles.
      expect(weekdayOf(toHouseholdClock("2026-10-02T16:30:00.000Z"))).toBe("Sat");
    });
  });

  it("stamps a day with the house's offset for the scheduler", () => {
    onDevice(device, () => {
      setHouseholdTimeZone("Asia/Manila");
      expect(householdDayStamp(new Date(2026, 9, 1))).toBe("2026-10-01T00:00:00+08:00");
    });
  });
});

describe("a household that observes daylight saving", () => {
  it("lands on the right instant either side of the change", () => {
    onDevice("Asia/Manila", () => {
      setHouseholdTimeZone("America/New_York");
      // EDT (UTC-4) before Nov 1 2026, EST (UTC-5) after.
      expect(combineDateAndTime("2026-10-31", "9:00 AM")).toBe("2026-10-31T13:00:00.000Z");
      expect(combineDateAndTime("2026-11-02", "9:00 AM")).toBe("2026-11-02T14:00:00.000Z");
      expect(householdDayStamp(new Date(2026, 10, 2))).toBe("2026-11-02T00:00:00-05:00");
    });
  });
});

describe("before the household's zone is known", () => {
  it("uses the device's zone, as before", () => {
    onDevice("Asia/Dubai", () => {
      setHouseholdTimeZone(null);
      expect(combineDateAndTime("2026-10-01", "7:30 PM")).toBe("2026-10-01T15:30:00.000Z");
      expect(toISODate(toHouseholdClock("2026-10-01T21:00:00.000Z"))).toBe("2026-10-02");
    });
  });

  it("ignores a zone name it doesn't recognise", () => {
    onDevice("Asia/Manila", () => {
      setHouseholdTimeZone("Mars/Olympus");
      expect(fromHouseholdClock(2026, 10, 1).toISOString()).toBe("2026-09-30T16:00:00.000Z");
    });
  });
});
