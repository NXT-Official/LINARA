import { beforeEach, describe, expect, it, vi } from "vitest";

const anonFrom = vi.hoisted(() => vi.fn());
const authedFrom = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({
  supabaseClient: { from: anonFrom },
  createAuthedClient: () => ({ from: authedFrom }),
}));

import { FAQ_FALLBACK } from "./faq-fallback";
import { deleteFaq, listAllFaqs, loadFaqs, saveFaq } from "./faq.actions";
import { createAuthedClient } from "@/lib/supabase";

const authed = () => createAuthedClient("t");

const row = {
  id: "f1",
  question: "Q?",
  answer: "A.",
  category: "General",
  sort_order: 2,
  published: true,
};

/** A select chain: select -> eq -> order -> order resolving to `result`. */
function selectChain(result: unknown) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return chain;
}

beforeEach(() => {
  anonFrom.mockReset();
  authedFrom.mockReset();
});

describe("loadFaqsFn", () => {
  it("returns the checked-in answers when the client throws", async () => {
    anonFrom.mockImplementation(() => {
      throw new Error("boom");
    });
    const reply = await loadFaqs();
    expect(reply.source).toBe("fallback");
    expect(reply.faqs).toEqual(FAQ_FALLBACK);
  });

  it("falls back on an error reply and on an empty table", async () => {
    anonFrom.mockReturnValueOnce(selectChain({ data: null, error: { message: "x" } }));
    expect((await loadFaqs()).source).toBe("fallback");
    anonFrom.mockReturnValueOnce(selectChain({ data: [], error: null }));
    expect((await loadFaqs()).source).toBe("fallback");
  });

  it("maps database rows", async () => {
    anonFrom.mockReturnValueOnce(selectChain({ data: [row], error: null }));
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
});

describe("admin functions", () => {
  it("say unavailable when the table is missing", async () => {
    authedFrom.mockReturnValue(selectChain({ data: null, error: { code: "42P01", message: "x" } }));
    expect(await listAllFaqs(authed())).toEqual({ available: false, faqs: [] });
  });

  it("lists every row for an admin", async () => {
    authedFrom.mockReturnValue(selectChain({ data: [{ ...row, published: false }], error: null }));
    const reply = await listAllFaqs(authed());
    expect(reply.available).toBe(true);
    expect(reply.faqs[0].published).toBe(false);
  });

  it("saves a new row with insert and an existing one with update", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const eq = vi.fn(() => ({ select: async () => ({ data: [{ id: "f1" }], error: null }) }));
    const update = vi.fn(() => ({ eq }));
    authedFrom.mockReturnValue({ insert, update });
    const faq = { question: "Q?", answer: "A.", category: "Help", sortOrder: 1, published: true };
    expect(await saveFaq(authed(), faq)).toEqual({ available: true });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ sort_order: 1, category: "Help" }),
    );
    await saveFaq(authed(), { ...faq, id: "f1" });
    expect(eq).toHaveBeenCalledWith("id", "f1");
  });

  it("throws the database message when a save is refused", async () => {
    authedFrom.mockReturnValue({
      insert: async () => ({ error: { code: "42501", message: "not allowed" } }),
    });
    await expect(
      saveFaq(authed(), {
        question: "Q",
        answer: "A",
        category: "C",
        sortOrder: 0,
        published: false,
      }),
    ).rejects.toThrow("not allowed");
  });

  it("refuses a delete that removed no row", async () => {
    const eq = () => ({ select: async () => ({ data: [], error: null }) });
    authedFrom.mockReturnValue({ delete: () => ({ eq }) });
    await expect(deleteFaq(authed(), "f1")).rejects.toThrow(/not removed/);
  });

  it("deletes by id", async () => {
    const eq = vi.fn(() => ({ select: async () => ({ data: [{ id: "f1" }], error: null }) }));
    authedFrom.mockReturnValue({ delete: () => ({ eq }) });
    expect(await deleteFaq(authed(), "f1")).toEqual({ available: true });
    expect(eq).toHaveBeenCalledWith("id", "f1");
  });
});
