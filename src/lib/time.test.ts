import { describe, expect, it } from "vitest";
import {
  weekdayOf,
  parseTimeToMinutes,
  formatDisplayTime,
  computePrepSchedule,
  displayTimeTo24h,
  parseHM,
  fmtHM12,
} from "./time";

describe("time helper utilities", () => {
  describe("weekdayOf", () => {
    it("correctly maps dates to Mon..Sun short names", () => {
      // 2026-08-03 is a Monday (August 3, 2026)
      const d = new Date(2026, 7, 3); // Month is 0-indexed, so 7 is August
      expect(weekdayOf(d)).toBe("Mon");
    });
  });

  describe("parseTimeToMinutes", () => {
    it("correctly parses AM times", () => {
      expect(parseTimeToMinutes("6:30 AM")).toBe(6 * 60 + 30);
      expect(parseTimeToMinutes("12:15 AM")).toBe(15);
    });

    it("correctly parses PM times", () => {
      expect(parseTimeToMinutes("3:30 PM")).toBe(15 * 60 + 30);
      expect(parseTimeToMinutes("12:00 PM")).toBe(12 * 60);
    });

    it("returns 0 for malformed time strings", () => {
      expect(parseTimeToMinutes("invalid")).toBe(0);
    });
  });

  describe("formatDisplayTime", () => {
    it("formats minutes since midnight to AM/PM string", () => {
      expect(formatDisplayTime(6 * 60 + 30)).toBe("6:30 AM");
      expect(formatDisplayTime(15 * 60 + 45)).toBe("3:45 PM");
      expect(formatDisplayTime(0)).toBe("12:00 AM");
      expect(formatDisplayTime(12 * 60)).toBe("12:00 PM");
    });
  });

  describe("computePrepSchedule", () => {
    it("computes offset schedules backwards correctly", () => {
      // sir's flight is at 6:00 AM, prep is 45 minutes before
      const result = computePrepSchedule("2026-08-03", "6:00 AM", 45);
      expect(result.date).toBe("2026-08-03");
      expect(result.time).toBe("5:15 AM");
    });

    it("handles negative offsets crossing midnight boundaries", () => {
      // sir's flight is at 12:30 AM, prep is 60 minutes before (crosses to previous day)
      const result = computePrepSchedule("2026-08-03", "12:30 AM", 60);
      expect(result.date).toBe("2026-08-02");
      expect(result.time).toBe("11:30 PM");
    });
  });

  describe("parseHM / fmtHM12", () => {
    it("parses plain HH:MM", () => {
      expect(parseHM("6:30")).toBe(6 * 60 + 30);
      expect(parseHM("18:00")).toBe(18 * 60);
    });

    it("parses Postgres TIME strings with seconds (Supabase shift_start/shift_end shape)", () => {
      expect(parseHM("18:00:00")).toBe(18 * 60);
      expect(fmtHM12("18:00:00")).toBe("6:00 PM");
      expect(fmtHM12("06:00:00")).toBe("6:00 AM");
    });

    it("returns 0 for malformed time strings", () => {
      expect(parseHM("not-a-time")).toBe(0);
      expect(parseHM("")).toBe(0);
      expect(parseHM("18")).toBe(0);
    });

    it("rejects out-of-range values instead of returning nonsense minutes", () => {
      // The previous regex accepted these via \d{1,2}/\d{2}, so "99:99"
      // silently became minute 6039 -- past the end of the day.
      expect(parseHM("99:99")).toBe(0);
      expect(parseHM("24:00")).toBe(0);
    });
  });

  describe("displayTimeTo24h", () => {
    it("converts display time to HH:MM format", () => {
      expect(displayTimeTo24h("6:30 AM")).toBe("06:30");
      expect(displayTimeTo24h("3:45 PM")).toBe("15:45");
      expect(displayTimeTo24h("12:00 AM")).toBe("00:00");
    });
  });
});
