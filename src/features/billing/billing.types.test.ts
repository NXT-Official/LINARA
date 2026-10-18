import { describe, expect, it } from "vitest";

import { joinErrorCopy, paidFlag, trialEligible } from "./billing.types";

describe("paidFlag", () => {
  it("takes the number the router parses from ?paid=1 as well as the string", () => {
    expect(paidFlag(1)).toBe("1");
    expect(paidFlag("1")).toBe("1");
    expect(paidFlag(0)).toBe("0");
    expect(paidFlag("0")).toBe("0");
  });

  it("drops anything else", () => {
    expect(paidFlag(2)).toBeUndefined();
    expect(paidFlag("yes")).toBeUndefined();
    expect(paidFlag(undefined)).toBeUndefined();
  });
});

describe("trialEligible", () => {
  it("needs a plan with a trial and homes with no history", () => {
    expect(trialEligible({ trialDays: 14 }, ["h1"], [])).toBe(true);
    expect(trialEligible({ trialDays: 0 }, ["h1"], [])).toBe(false);
    expect(trialEligible({ trialDays: 14 }, ["h1", "h2"], ["h2"])).toBe(false);
    expect(trialEligible({ trialDays: 14 }, ["h1"], ["h2"])).toBe(true);
  });
});

describe("joinErrorCopy", () => {
  it("explains a full household and leaves other errors alone", () => {
    expect(joinErrorCopy("SEAT_LIMIT:manager")).toBe(
      "This household has used all its manager seats. Ask its primary manager to add one.",
    );
    expect(joinErrorCopy("Invite expired")).toBe("Invite expired");
  });
});
