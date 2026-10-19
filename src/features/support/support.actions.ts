import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import type { SupportMessage, SupportStatus, SupportThread } from "./support.types";

type Client = ReturnType<typeof createAuthedClient>;

type TicketRow = {
  id: string;
  ref: number;
  subject: string;
  status: SupportStatus;
  created_at: string;
  last_message_at: string | null;
  household_unread: number;
};

type MessageRow = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  from_staff: boolean;
  body: string;
  created_at: string;
};

/** The household_support_* functions (LINARA_ADMIN 019) aren't applied yet. */
const missing = (error: { code?: string; message?: string } | null) =>
  error?.code === "PGRST202" ||
  error?.code === "42883" ||
  /does not exist|could not find/i.test(error?.message ?? "");

/** The RPC's own `CODE:detail` is for matching, not for people. */
function fail(error: { message?: string } | null, fallback: string): never {
  const message = error?.message ?? "";
  if (/^NOT_FOUND\b/.test(message)) throw new Error("That conversation isn't available anymore.");
  if (/^BAD_INPUT:subject\b/.test(message))
    throw new Error("Give your message a subject (up to 120 characters).");
  if (/^BAD_INPUT:body\b/.test(message))
    throw new Error("Write a message (up to 4000 characters).");
  throw new Error(message || fallback);
}

const toThread = (r: TicketRow): SupportThread => ({
  id: r.id,
  ref: r.ref,
  subject: r.subject,
  status: r.status,
  createdAt: r.created_at,
  lastMessageAt: r.last_message_at,
  householdUnread: r.household_unread,
});

const toMessage = (r: MessageRow): SupportMessage => ({
  id: r.id,
  ticketId: r.ticket_id,
  authorId: r.author_id,
  fromStaff: r.from_staff,
  body: r.body,
  createdAt: r.created_at,
});

export async function listThreads(
  client: Client,
  input: { householdId: string },
): Promise<{ available: boolean; threads: SupportThread[] }> {
  const { data, error } = await client.rpc("household_support_list", {
    p_household_id: input.householdId,
  });
  if (missing(error)) return { available: false, threads: [] };
  if (error) fail(error, "Couldn't load the messages");
  return { available: true, threads: ((data ?? []) as TicketRow[]).map(toThread) };
}

export async function listMessages(
  client: Client,
  ticketId: string,
): Promise<{ available: boolean; messages: SupportMessage[] }> {
  const { data, error } = await client.rpc("household_support_messages", {
    p_ticket_id: ticketId,
  });
  if (missing(error)) return { available: false, messages: [] };
  if (error) fail(error, "Couldn't load the conversation");
  return { available: true, messages: ((data ?? []) as MessageRow[]).map(toMessage) };
}

export async function openThread(
  client: Client,
  input: { householdId: string; subject: string; body: string },
): Promise<{ available: boolean; threadId: string | null }> {
  const { data, error } = await client.rpc("household_support_open", {
    p_household_id: input.householdId,
    p_subject: input.subject.trim(),
    p_body: input.body.trim(),
  });
  if (missing(error)) return { available: false, threadId: null };
  if (error) fail(error, "Couldn't send your message");
  return { available: true, threadId: data as string };
}

export async function postMessage(
  client: Client,
  input: { threadId: string; body: string },
): Promise<{ available: boolean }> {
  const { error } = await client.rpc("household_support_post", {
    p_ticket_id: input.threadId,
    p_body: input.body.trim(),
  });
  if (missing(error)) return { available: false };
  if (error) fail(error, "Couldn't send your message");
  return { available: true };
}

export async function markRead(client: Client, threadId: string): Promise<{ available: boolean }> {
  const { error } = await client.rpc("household_support_mark_read", { p_ticket_id: threadId });
  if (missing(error)) return { available: false };
  if (error) fail(error, "Couldn't mark the conversation read");
  return { available: true };
}

export const listThreadsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; householdId: string }) => data)
  .handler(({ data }) =>
    listThreads(createAuthedClient(data.token), { householdId: data.householdId }),
  );

export const listMessagesFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; threadId: string }) => data)
  .handler(({ data }) => listMessages(createAuthedClient(data.token), data.threadId));

export const openThreadFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; householdId: string; subject: string; body: string }) => data)
  .handler(({ data }) =>
    openThread(createAuthedClient(data.token), {
      householdId: data.householdId,
      subject: data.subject,
      body: data.body,
    }),
  );

export const postMessageFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; threadId: string; body: string }) => data)
  .handler(({ data }) =>
    postMessage(createAuthedClient(data.token), { threadId: data.threadId, body: data.body }),
  );

export const markReadFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; threadId: string }) => data)
  .handler(({ data }) => markRead(createAuthedClient(data.token), data.threadId));
