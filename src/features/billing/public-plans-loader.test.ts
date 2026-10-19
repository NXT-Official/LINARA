import { describe, expect, it } from "vitest";

import { loadPublicPlans } from "./public-plans-loader";

describe("loadPublicPlans", () => {
  it("passes a good answer through", async () => {
    const res = { available: true, plans: [] };
    expect(await loadPublicPlans(async () => res)).toBe(res);
  });

  it("turns a thrown error into no plans instead of an error page", async () => {
    expect(
      await loadPublicPlans(async () => {
        throw new Error("503");
      }),
    ).toEqual({ available: false, plans: [] });
  });

  it("turns a non-plans reply into no plans", async () => {
    expect(await loadPublicPlans(async () => ({}) as never)).toEqual({
      available: false,
      plans: [],
    });
  });
});
