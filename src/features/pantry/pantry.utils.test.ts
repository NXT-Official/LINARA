import { describe, expect, it } from "vitest";

import { PANTRY_CATEGORIES } from "./pantry.types";
import {
  groupByPantryCategory,
  needsBuying,
  pantryItemErrors,
  STARTER_ITEMS,
  STARTER_ORDER,
  stockState,
  unitFor,
} from "./pantry.utils";

describe("stockState", () => {
  it("is out at zero, low under the keep-at-least amount, else ok", () => {
    expect(stockState({ qty: 0, par: 2 })).toBe("out");
    expect(stockState({ qty: 1.5, par: 2 })).toBe("low");
    expect(stockState({ qty: 2, par: 2 })).toBe("ok");
    expect(stockState({ qty: 3, par: 2 })).toBe("ok");
  });

  it("counts zero as out even with no keep-at-least amount", () => {
    expect(stockState({ qty: 0, par: 0 })).toBe("out");
  });

  it("is enough once the suggested amount is bought", () => {
    // Out of toilet roll, keep at least 1: the suggestion is 1, and after it, it's fine.
    expect(stockState({ qty: 0 + 1, par: 1 })).toBe("ok");
  });
});

describe("needsBuying", () => {
  it("is true for out and low, false at or over the amount", () => {
    expect(needsBuying({ qty: 0, par: 0 })).toBe(true);
    expect(needsBuying({ qty: 1, par: 2 })).toBe(true);
    expect(needsBuying({ qty: 2, par: 2 })).toBe(false);
  });
});

describe("STARTER_ITEMS", () => {
  it("only uses categories the database accepts", () => {
    for (const item of STARTER_ITEMS) {
      expect(PANTRY_CATEGORIES).toContain(item.category);
    }
  });

  it("starts every item stocked, above its keep-at-least amount", () => {
    for (const item of STARTER_ITEMS) {
      expect(stockState(item)).toBe("ok");
    }
  });

  it("has no duplicate names", () => {
    const names = STARTER_ITEMS.map((i) => i.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("groupByPantryCategory", () => {
  const pantry = [
    { id: "rice", category: "Rice & grains" as const },
    { id: "soap", category: "Cleaning" as const },
    { id: "eggs", category: "Fresh" as const },
  ];

  it("puts each line under its pantry item's category, in pantry order", () => {
    const groups = groupByPantryCategory(
      [
        { name: "Sabon", pantryItemId: "soap" },
        { name: "Bigas", pantryItemId: "rice" },
        { name: "Itlog", pantryItemId: "eggs" },
      ],
      pantry,
      PANTRY_CATEGORIES,
    );
    expect(groups.map((g) => [g.section.label, g.items.map((i) => i.name)])).toEqual([
      ["Rice & grains", ["Bigas"]],
      ["Fresh", ["Itlog"]],
      ["Cleaning", ["Sabon"]],
    ]);
  });

  it("files hand-added lines, and ones whose pantry item is gone, under Other", () => {
    const groups = groupByPantryCategory(
      [{ name: "Ulam for Sunday" }, { name: "Old item", pantryItemId: "deleted" }],
      pantry,
      PANTRY_CATEGORIES,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].section.key).toBe("other");
    expect(groups[0].items).toHaveLength(2);
  });

  it("is empty for an empty list", () => {
    expect(groupByPantryCategory([], pantry, PANTRY_CATEGORIES)).toEqual([]);
  });
});

describe("unitFor", () => {
  it("drops a plural unit's s at exactly one", () => {
    expect(unitFor(1, "packs")).toBe("pack");
    expect(unitFor(1, "Bottles")).toBe("Bottle");
    expect(unitFor(1, "boxes")).toBe("box");
    expect(unitFor(2, "packs")).toBe("packs");
  });

  it("says 1 pc, as the grocery list does", () => {
    expect(unitFor(1, "pcs")).toBe("pc");
    expect(unitFor(0, "pcs")).toBe("pcs");
    expect(unitFor(3, "pcs")).toBe("pcs");
  });

  it("leaves other units as typed", () => {
    expect(unitFor(1, "kg")).toBe("kg");
    expect(unitFor(1, "L")).toBe("L");
  });
});

describe("STARTER_ORDER", () => {
  it("covers every category the starter list uses", () => {
    for (const item of STARTER_ITEMS) expect(STARTER_ORDER).toContain(item.category);
  });
});

describe("pantryItemErrors", () => {
  const ok = { name: "Bigas", qty: "10", unit: "kg", par: "5" };

  it("passes a filled-in item, decimals and zero included", () => {
    expect(pantryItemErrors(ok)).toEqual({});
    expect(pantryItemErrors({ ...ok, qty: "0", par: "0.5" })).toEqual({});
  });

  it("names each field that's wrong (QA: empty name, Qty abc, Par -5)", () => {
    expect(pantryItemErrors({ name: "  ", qty: "abc", unit: "", par: "-5" })).toEqual({
      name: "Give it a name.",
      qty: "A number, 0 or more.",
      par: "A number, 0 or more.",
    });
    expect(pantryItemErrors({ ...ok, qty: "" }).qty).toBeDefined();
    expect(pantryItemErrors({ ...ok, par: "Infinity" }).par).toBeDefined();
  });
});
