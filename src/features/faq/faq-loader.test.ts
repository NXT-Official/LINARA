import { describe, expect, it } from "vitest";

import { FAQ_FALLBACK } from "./faq-fallback";
import { loadFaqsSafely, type FaqReply } from "./faq-loader";

const good: FaqReply = {
  source: "db",
  faqs: [{ id: "1", question: "Q?", answer: "A.", category: "Help", sortOrder: 0 }],
};

describe("loadFaqsSafely", () => {
  it("passes a good reply through", async () => {
    expect(await loadFaqsSafely(async () => good)).toBe(good);
  });

  it("serves the fallback when the call throws", async () => {
    const reply = await loadFaqsSafely(async () => {
      throw new Error("supabaseUrl is required.");
    });
    expect(reply).toEqual({ faqs: FAQ_FALLBACK, source: "fallback" });
  });

  it("serves the fallback for a malformed or empty reply", async () => {
    const malformed = (await loadFaqsSafely(async () => ({}) as FaqReply)).source;
    const empty = (await loadFaqsSafely(async () => ({ faqs: [], source: "db" }))).source;
    expect([malformed, empty]).toEqual(["fallback", "fallback"]);
  });
});
