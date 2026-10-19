import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ createAuthedClient: () => ({}) }));

import { listMessages, listThreads, openThread, postMessage } from "./support.actions";

const clientWith = (reply: { data: unknown; error: { message: string } | null }) =>
  ({ rpc: vi.fn().mockResolvedValue(reply) }) as never;

describe("openThread", () => {
  const input = { householdId: "h1", subject: "Hi", body: "Hello" };

  it("says what to fix for a bad subject, not the raw code", async () => {
    const client = clientWith({ data: null, error: { message: "BAD_INPUT:subject" } });
    await expect(openThread(client, input)).rejects.toThrow(
      "Give your message a subject (up to 120 characters).",
    );
  });

  it("says what to fix for a bad body", async () => {
    const client = clientWith({ data: null, error: { message: "BAD_INPUT:body" } });
    await expect(openThread(client, input)).rejects.toThrow(
      "Write a message (up to 4000 characters).",
    );
    await expect(postMessage(client, { threadId: "t1", body: "" })).rejects.toThrow(
      "Write a message (up to 4000 characters).",
    );
  });
});

describe("staff rows", () => {
  it("keeps a null author on a staff line", async () => {
    const client = clientWith({
      data: [
        {
          id: "m1",
          ticket_id: "t1",
          author_id: null,
          from_staff: true,
          body: "Hello",
          created_at: "2026-10-19T00:00:00Z",
        },
      ],
      error: null,
    });
    const out = await listMessages(client, "t1");
    expect(out.messages[0]).toMatchObject({ authorId: null, fromStaff: true });
  });

  it("keeps a null last-message time on a thread with no line yet", async () => {
    const client = clientWith({
      data: [
        {
          id: "t1",
          ref: 4,
          subject: "S",
          status: "open",
          created_at: "2026-10-19T00:00:00Z",
          last_message_at: null,
          household_unread: 0,
        },
      ],
      error: null,
    });
    const out = await listThreads(client, { householdId: "h1" });
    expect(out.threads[0]?.lastMessageAt).toBeNull();
  });
});
