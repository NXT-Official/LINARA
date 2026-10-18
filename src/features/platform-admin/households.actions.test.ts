import { describe, expect, it, vi } from "vitest";

import { describeAdminError } from "./households.actions";

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

  it("passes anything else through", () => {
    expect(describeAdminError("SEATS_OVER_PLAN:3")).toBe("SEATS_OVER_PLAN:3");
  });
});
