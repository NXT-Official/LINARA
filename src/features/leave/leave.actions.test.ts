import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ createAuthedClient: vi.fn(), supabaseClient: {} }));

import { readLeavePolicy } from "./leave.actions";

type Reply = { data: unknown; error: { code?: string; message: string } | null };

/** A client whose every chain records its .eq() filters and resolves to its table's reply. */
function fakeClient(replies: Record<string, Reply>) {
  const filters: Record<string, [string, unknown][]> = {};
  const from = (table: string) => {
    filters[table] = filters[table] ?? [];
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters[table].push([column, value]);
        return chain;
      },
      limit: () => chain,
      maybeSingle: async () => replies[table] ?? { data: null, error: null },
    };
    return chain;
  };
  const client = {
    from,
    auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
  } as unknown as Parameters<typeof readLeavePolicy>[0];
  return { client, filters };
}

describe("readLeavePolicy", () => {
  it("reads the caller's own household by id, not the first row RLS shows", async () => {
    const { client, filters } = fakeClient({
      user_profiles: { data: { household_id: "home-1" }, error: null },
      households: { data: { sil_waits_first_year: true, sil_days_per_year: 7 }, error: null },
    });
    expect(await readLeavePolicy(client)).toEqual({ silWaitsFirstYear: true, silDaysPerYear: 7 });
    expect(filters.user_profiles).toEqual([["id", "u1"]]);
    expect(filters.households).toEqual([["id", "home-1"]]);
  });

  it("is null for a caller with no household, without reading households", async () => {
    const { client, filters } = fakeClient({
      user_profiles: { data: { household_id: null }, error: null },
    });
    expect(await readLeavePolicy(client)).toBeNull();
    expect(filters.households).toBeUndefined();
  });

  it("is null before add-leave-policy.sql adds the columns", async () => {
    const { client } = fakeClient({
      user_profiles: { data: { household_id: "home-1" }, error: null },
      households: { data: null, error: { code: "42703", message: "column does not exist" } },
    });
    expect(await readLeavePolicy(client)).toBeNull();
  });
});
