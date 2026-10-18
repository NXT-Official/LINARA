import { describe, expect, it, vi } from "vitest";

import { describeAdminError, needsAttention, toHousehold } from "./households.actions";

vi.mock("@/lib/supabase", () => ({ createAuthedClient: vi.fn(), supabaseClient: {} }));

describe("describeAdminError", () => {
  it("words NOT_ADMIN", () => {
    expect(describeAdminError("NOT_ADMIN:caller")).toBe("You don't have admin access.");
  });

  it("words NOT_FOUND", () => {
    expect(describeAdminError("NOT_FOUND:plan")).toBe(
      "That household, plan or invoice no longer exists.",
    );
  });

  it("words BAD_PERIOD", () => {
    expect(describeAdminError("BAD_PERIOD:period_end")).toBe(
      "The end date must be in the future (or blank for no end).",
    );
  });

  it("words BAD_SEATS", () => {
    expect(describeAdminError("BAD_SEATS:helper")).toBe(
      "Seats must be blank (unlimited) or 0 or more.",
    );
  });

  it("passes anything else through", () => {
    expect(describeAdminError("SEATS_OVER_PLAN:3")).toBe("SEATS_OVER_PLAN:3");
  });
});

describe("toHousehold notes", () => {
  it("keeps every line of every subscription's note, in order", () => {
    const h = toHousehold({
      household_id: "h1",
      name: "Reyes",
      notes: [
        {
          subscription_id: "s2",
          status: "canceled",
          note: "Replaced by s3\nLate payment: refund in Xendit",
        },
        { subscription_id: "s1", status: "active", note: "Comped: pilot" },
      ],
    });
    expect(h.notes).toEqual(["Replaced by s3", "Late payment: refund in Xendit", "Comped: pilot"]);
  });

  it("is empty when there are none, or none came back", () => {
    expect(toHousehold({ notes: [] }).notes).toEqual([]);
    expect(toHousehold({}).notes).toEqual([]);
  });

  it("needs attention only when a note owes a refund", () => {
    expect(
      needsAttention(["Duplicate payment: session x paid invoice y again on z; refund in Xendit"]),
    ).toBe(true);
    expect(
      needsAttention([
        "Xendit confirmed session x after invoice y was marked paid by hand on z; no second payment",
      ]),
    ).toBe(false);
    expect(needsAttention([])).toBe(false);
  });
});
