import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ createAuthedClient: vi.fn() }));
vi.mock("@/features/notifications/push", () => ({ pushToHelper: vi.fn() }));

import { scheduleChange } from "./task.actions";

type Row = { title: string; status: string; helper_id: string | null; scheduled_start: string };

/** Just enough of a Supabase client for scheduleChange's two reads. */
function fakeClient(row: Row) {
  const single = (data: unknown) => ({
    select: () => ({ eq: () => ({ single: async () => ({ data, error: null }) }) }),
  });
  return {
    from: (table: string) => (table === "tickets" ? single(row) : single({ full_name: "Ana" })),
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  } as unknown as Parameters<typeof scheduleChange>[0];
}

const row: Row = {
  title: "Hang the laundry",
  status: "todo",
  helper_id: "h1",
  scheduled_start: "2026-10-01T00:00:00+00:00",
};

describe("scheduleChange", () => {
  it("is a move when her task's time changes", async () => {
    const change = await scheduleChange(fakeClient(row), "t1", {
      scheduledStartIso: "2026-10-03T00:00:00.000Z",
      helperId: "h1",
    });
    expect(change).toMatchObject({
      moved: true,
      handedOver: false,
      helperId: "h1",
      oldStartIso: "2026-10-01T00:00:00.000Z",
      movedBy: "Ana",
    });
  });

  it("is nothing when the time and the helper are unchanged", async () => {
    const change = await scheduleChange(fakeClient(row), "t1", {
      scheduledStartIso: "2026-10-01T00:00:00.000Z",
      helperId: "h1",
    });
    expect(change).toBeNull();
  });

  it("is a hand-over, not a move, when someone else gets it", async () => {
    const change = await scheduleChange(fakeClient(row), "t1", {
      scheduledStartIso: "2026-10-03T00:00:00.000Z",
      helperId: "h2",
    });
    expect(change).toMatchObject({ moved: false, handedOver: true, helperId: "h2" });
  });

  it("leaves done and unassigned tasks alone", async () => {
    const later = { scheduledStartIso: "2026-10-03T00:00:00.000Z" };
    expect(await scheduleChange(fakeClient({ ...row, status: "done" }), "t1", later)).toBeNull();
    expect(await scheduleChange(fakeClient({ ...row, helper_id: null }), "t1", later)).toBeNull();
  });
});
