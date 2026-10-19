import { describe, expect, it } from "vitest";

import { describePlanPricing, intervalLabel, quoteAmount } from "./plan.pricing";
import type { Plan } from "./plan.types";

export const examplePlan = (over: Partial<Plan> = {}): Plan => ({
  id: "p1",
  name: "Home",
  tagline: "",
  inclusions: [],
  interval: "monthly",
  baseCentavos: 49900,
  includedHelpers: 1,
  includedManagers: 2,
  includedHomes: null,
  extraHelperCentavos: 9900,
  extraManagerCentavos: null,
  extraHomeCentavos: null,
  trialDays: 0,
  isPublic: true,
  status: "active",
  sortOrder: 0,
  ...over,
});

describe("quoteAmount", () => {
  it("adds extra helpers to the base, with a line per charged dimension", () => {
    const q = quoteAmount(examplePlan(), { helpers: 3, managers: 2, homes: 1 });
    expect(q).toEqual({
      ok: true,
      amountCentavos: 69700,
      lines: [
        { label: "Home base", centavos: 49900 },
        { label: "2 extra helpers", centavos: 19800 },
      ],
    });
  });

  it("refuses seats over a cap that has no extra price", () => {
    expect(quoteAmount(examplePlan(), { helpers: 1, managers: 3, homes: 1 })).toEqual({
      ok: false,
      over: "manager",
    });
  });

  it("charges nothing extra when included is unlimited (null)", () => {
    const q = quoteAmount(examplePlan({ includedHelpers: null, extraHelperCentavos: 9900 }), {
      helpers: 40,
      managers: 1,
      homes: 1,
    });
    expect(q.ok && q.amountCentavos).toBe(49900);
  });

  it("prices extra homes and managers at their own rate", () => {
    const q = quoteAmount(
      examplePlan({
        includedHomes: 1,
        extraHomeCentavos: 20000,
        includedManagers: 1,
        extraManagerCentavos: 5000,
      }),
      { helpers: 1, managers: 3, homes: 2 },
    );
    expect(q.ok && q.amountCentavos).toBe(49900 + 10000 + 20000);
  });
});

describe("intervalLabel / describePlanPricing", () => {
  it("labels the intervals", () => {
    expect(intervalLabel("one_time")).toBe("one-time");
    expect(intervalLabel("monthly")).toBe("per month");
    expect(intervalLabel("yearly")).toBe("per year");
  });

  it("describes the price in one sentence", () => {
    expect(describePlanPricing(examplePlan({ includedManagers: null }))).toBe(
      "₱499.00 per month, 1 helper included, ₱99.00 per extra helper",
    );
  });
});
