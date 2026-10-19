import { describe, expect, it } from "vitest";

import { billingErrorCopy, joinErrorCopy, paidFlag } from "./billing.types";

describe("paidFlag", () => {
  it("takes the number the router parses from ?paid=1 as well as the string", () => {
    expect(paidFlag(1)).toBe(1);
    expect(paidFlag("1")).toBe(1);
    expect(paidFlag(0)).toBe(0);
    expect(paidFlag("0")).toBe(0);
  });

  it("drops anything else", () => {
    expect(paidFlag(2)).toBeUndefined();
    expect(paidFlag("yes")).toBeUndefined();
    expect(paidFlag(undefined)).toBeUndefined();
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

describe("billingErrorCopy", () => {
  it("leaves the retired BAD_SEATS and BAD_PERIOD codes to the generic copy", () => {
    expect(billingErrorCopy("BAD_SEATS:helper")).toMatch(/Something went wrong/);
  });

  it("has plain copy for the new SQL codes", () => {
    expect(billingErrorCopy("BAD_URL:host")).toMatch(/payment page/);
    expect(billingErrorCopy("BAD_SESSION:xendit_id")).toMatch(/payment page/);
    expect(billingErrorCopy("BAD_SESSION:xendit_id")).not.toMatch(/Something went wrong/);
  });
});
