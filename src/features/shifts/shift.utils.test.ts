import { describe, expect, it } from "vitest";

import { uncoveredRestDay } from "./shift.utils";

describe("uncoveredRestDay", () => {
  it("is the day everyone in the group rests", () => {
    expect(uncoveredRestDay([0, 0])).toBe(0);
    expect(uncoveredRestDay([3, 3, 3])).toBe(3);
  });

  it("is null when someone works that day", () => {
    expect(uncoveredRestDay([0, 0, 1])).toBeNull();
  });

  it("is null for one person, or nobody", () => {
    expect(uncoveredRestDay([0])).toBeNull();
    expect(uncoveredRestDay([])).toBeNull();
  });
});
