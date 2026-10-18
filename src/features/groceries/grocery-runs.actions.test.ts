import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ createAuthedClient: vi.fn(), supabaseClient: {} }));

import { legacyBoard } from "./grocery-runs.actions";

type Reply = { data: unknown; error: { message: string } | null };

/** A client whose every chain records its .eq() filters and resolves to its table's reply. */
function fakeClient(replies: Record<string, Reply>) {
  const filters: Record<string, [string, unknown][]> = {};
  const from = (table: string) => {
    filters[table] = filters[table] ?? [];
    const reply = replies[table] ?? { data: null, error: null };
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters[table].push([column, value]);
        return chain;
      },
      limit: () => chain,
      order: () => chain,
      maybeSingle: async () => reply,
      then: (resolve: (v: Reply) => void) => resolve(reply),
    };
    return chain;
  };
  const client = {
    from,
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  } as unknown as Parameters<typeof legacyBoard>[0];
  return { client, filters };
}

describe("legacyBoard", () => {
  it("reads the petty-cash budget of the caller's own household by id", async () => {
    const { client, filters } = fakeClient({
      user_profiles: { data: { household_id: "home-1" }, error: null },
      households: { data: { petty_cash_budget: 2500 }, error: null },
      grocery_items: { data: [], error: null },
    });
    const board = await legacyBoard(client);
    expect(filters.user_profiles).toEqual([["id", "u1"]]);
    expect(filters.households).toEqual([["id", "home-1"]]);
    expect(board.budgets.house).toBe(2500);
    expect(board.available).toBe(false);
  });

  it("refuses a caller with no household", async () => {
    const { client } = fakeClient({ user_profiles: { data: { household_id: null }, error: null } });
    await expect(legacyBoard(client)).rejects.toThrow("Unauthorized: Profile not found");
  });
});
