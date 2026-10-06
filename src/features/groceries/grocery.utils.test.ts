import { describe, expect, it } from "vitest";

import type { GroceryItem, GroceryRun } from "./grocery.types";
import {
  expectedChange,
  fmtQty,
  monthBounds,
  nextDue,
  progress,
  reconcile,
  sortOpenRuns,
  spentOn,
} from "./grocery.utils";

const item = (over: Partial<GroceryItem>): GroceryItem => ({
  id: Math.random().toString(36),
  name: "Bigas",
  qty: 1,
  unit: "kg",
  bought: false,
  ...over,
});

const run = (over: Partial<GroceryRun>): GroceryRun => ({
  id: Math.random().toString(36),
  title: "Palengke",
  status: "draft",
  teamId: null,
  shopOn: null,
  ticketId: null,
  templateId: null,
  cashGiven: null,
  changeReturned: null,
  note: "",
  shopperIds: [],
  createdByName: null,
  approvedByName: null,
  closedByName: null,
  createdAt: "2026-10-01T00:00:00Z",
  closedAt: null,
  ...over,
});

describe("spentOn / progress", () => {
  it("counts only what was bought", () => {
    const items = [
      item({ bought: true, costPHP: 120 }),
      item({ bought: true }),
      item({ bought: false, costPHP: 999 }),
    ];
    expect(spentOn(items)).toBe(120);
    expect(progress(items)).toEqual({ bought: 2, total: 3 });
  });
});

describe("reconcile", () => {
  it("balances when cash = spent + change", () => {
    expect(reconcile({ cashGiven: 1500, changeReturned: 380 }, 1120).gap).toBe(0);
  });
  it("shows what's missing", () => {
    expect(reconcile({ cashGiven: 1500, changeReturned: 300 }, 1120).gap).toBe(80);
  });
  it("has nothing to compare until there's cash and change", () => {
    expect(reconcile({ cashGiven: 1500, changeReturned: null }, 1120).gap).toBeNull();
    expect(reconcile({ cashGiven: null, changeReturned: 0 }, 0).gap).toBeNull();
  });
  it("expects the change, never below zero", () => {
    expect(expectedChange(1500, 1120.5)).toBe(379.5);
    expect(expectedChange(1000, 1200)).toBe(0);
    expect(expectedChange(null, 10)).toBeNull();
  });
});

describe("monthBounds", () => {
  it("runs from the 1st to the 1st of the next month", () => {
    const { start, end } = monthBounds(new Date(2026, 11, 15, 13));
    expect([start.getFullYear(), start.getMonth(), start.getDate()]).toEqual([2026, 11, 1]);
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2027, 0, 1]);
  });
});

describe("nextDue", () => {
  // Tuesday 6 October 2026.
  const tue = new Date(2026, 9, 6, 9);
  it("is the coming Saturday for a Saturday repeat", () => {
    expect(nextDue({ weekday: 6, lastStartedAt: null }, tue)).toEqual({
      date: "2026-10-10",
      daysAway: 4,
    });
  });
  it("is today on the day", () => {
    expect(nextDue({ weekday: 2, lastStartedAt: null }, tue)?.daysAway).toBe(0);
  });
  it("isn't due again once started for this week", () => {
    expect(nextDue({ weekday: 6, lastStartedAt: "2026-10-05T02:00:00Z" }, tue)).toBeNull();
  });
  it("is due again after last week's", () => {
    expect(nextDue({ weekday: 6, lastStartedAt: "2026-10-03T02:00:00Z" }, tue)?.date).toBe(
      "2026-10-10",
    );
  });
  it("has no due day without a weekday", () => {
    expect(nextDue({ weekday: null, lastStartedAt: null }, tue)).toBeNull();
  });
});

describe("sortOpenRuns", () => {
  it("puts what needs someone first, soonest first", () => {
    const sorted = sortOpenRuns([
      run({ id: "draft", status: "draft" }),
      run({ id: "ready-later", status: "ready", shopOn: "2026-10-12" }),
      run({ id: "ready-soon", status: "ready", shopOn: "2026-10-08" }),
      run({ id: "pending", status: "pending" }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["pending", "ready-soon", "ready-later", "draft"]);
  });
});

describe("fmtQty", () => {
  it("says one piece in the singular, and leaves other units alone", () => {
    expect(fmtQty(1, "pcs")).toBe("1 pc");
    expect(fmtQty(2, "pcs")).toBe("2 pcs");
    expect(fmtQty(1, "stalk")).toBe("1 stalk");
    expect(fmtQty(0.5, "kg")).toBe("0.5 kg");
  });
});
