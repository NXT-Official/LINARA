import { beforeEach, describe, expect, it, vi } from "vitest";

const anonRpc = vi.hoisted(() => vi.fn());
const anonFrom = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabaseClient: { rpc: anonRpc, from: anonFrom },
  createAuthedClient: () => ({}),
}));

import { FAQ_FALLBACK } from "./faq-fallback";
import * as faqActions from "./faq.actions";
import { loadFaqs } from "./faq.actions";

const row = {
  id: "f1",
  question: "Q?",
  answer: "A.",
  category: "General",
  sort_order: 2,
  published: true,
};

beforeEach(() => {
  anonRpc.mockReset();
  anonFrom.mockReset();
});

describe("faq.actions exports", () => {
  it("keeps only the public read: FAQ editing lives in the Linara console", () => {
    expect(Object.keys(faqActions).sort()).toEqual(["loadFaqs", "loadFaqsFn"]);
  });
});

describe("loadFaqs", () => {
  it("asks faq_public_list on the anon client and reads no table", async () => {
    anonRpc.mockResolvedValueOnce({ data: [row], error: null });
    await loadFaqs();
    expect(anonRpc).toHaveBeenCalledWith("faq_public_list");
    expect(anonFrom).not.toHaveBeenCalled();
  });

  it("returns the checked-in answers when the client throws", async () => {
    anonRpc.mockImplementation(() => {
      throw new Error("boom");
    });
    const reply = await loadFaqs();
    expect(reply.source).toBe("fallback");
    expect(reply.faqs).toEqual(FAQ_FALLBACK);
  });

  it("falls back on an error reply, a missing function, an empty list and a non-list", async () => {
    anonRpc.mockResolvedValueOnce({ data: null, error: { message: "x" } });
    expect((await loadFaqs()).source).toBe("fallback");
    anonRpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "x" } });
    expect((await loadFaqs()).source).toBe("fallback");
    anonRpc.mockResolvedValueOnce({ data: [], error: null });
    expect((await loadFaqs()).source).toBe("fallback");
    anonRpc.mockResolvedValueOnce({ data: { id: "f1" }, error: null });
    expect((await loadFaqs()).source).toBe("fallback");
  });

  it("maps rows, reading a row without the published flag as published", async () => {
    const unflagged = {
      id: "f1",
      question: "Q?",
      answer: "A.",
      category: "General",
      sort_order: 2,
    };
    anonRpc.mockResolvedValueOnce({ data: [unflagged], error: null });
    const reply = await loadFaqs();
    expect(reply).toEqual({
      source: "db",
      faqs: [
        {
          id: "f1",
          question: "Q?",
          answer: "A.",
          category: "General",
          sortOrder: 2,
          published: true,
        },
      ],
    });
  });

  it("orders by category, then sort order, whatever order the reply has", async () => {
    anonRpc.mockResolvedValueOnce({
      data: [
        { ...row, id: "c", category: "Pay", sort_order: 0 },
        { ...row, id: "b", category: "General", sort_order: 5 },
        { ...row, id: "a", category: "General", sort_order: 1 },
      ],
      error: null,
    });
    const reply = await loadFaqs();
    expect(reply.faqs.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });
});
