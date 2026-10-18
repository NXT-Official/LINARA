import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";

import type { SupportMessage, SupportSide, SupportStatus, SupportThread } from "./support.types";

type Client = ReturnType<typeof createAuthedClient>;

type ThreadRow = {
  id: string;
  household_id: string;
  subject: string;
  status: SupportStatus;
  created_at: string;
  last_message_at: string;
  household_unread: number;
  platform_admin_unread: number;
  households?: { name: string | null } | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  author_id: string;
  from_platform_admin: boolean;
  body: string;
  created_at: string;
};

/** supabase/add-support-chat.sql isn't applied yet. */
const missing = (error: { code?: string; message?: string } | null) =>
  error?.code === "PGRST202" ||
  error?.code === "42883" ||
  error?.code === "42P01" ||
  error?.code === "PGRST205" ||
  /does not exist|could not find/i.test(error?.message ?? "");

/** The RPC's own `CODE:detail` is for matching, not for people. */
function fail(error: { message?: string } | null, fallback: string): never {
  const message = error?.message ?? "";
  if (/^(NOT_FOUND|NOT_ADMIN):/.test(message)) throw new Error(fallback);
  throw new Error(message || fallback);
}

const toThread = (r: ThreadRow): SupportThread => ({
  id: r.id,
  householdId: r.household_id,
  householdName: r.households?.name ?? null,
  subject: r.subject,
  status: r.status,
  createdAt: r.created_at,
  lastMessageAt: r.last_message_at,
  householdUnread: r.household_unread,
  platformAdminUnread: r.platform_admin_unread,
});

const toMessage = (r: MessageRow): SupportMessage => ({
  id: r.id,
  threadId: r.thread_id,
  authorId: r.author_id,
  fromPlatformAdmin: r.from_platform_admin,
  body: r.body,
  createdAt: r.created_at,
});

const THREAD_COLUMNS =
  "id, household_id, subject, status, created_at, last_message_at, household_unread, platform_admin_unread";

export async function listThreads(
  client: Client,
  input: { scope: SupportSide; householdId?: string },
): Promise<{ available: boolean; threads: SupportThread[] }> {
  const admin = input.scope === "platform_admin";
  let query = client
    .from("support_threads")
    .select(admin ? `${THREAD_COLUMNS}, households(name)` : THREAD_COLUMNS)
    .order("last_message_at", { ascending: false });
  if (!admin && input.householdId) query = query.eq("household_id", input.householdId);
  const { data, error } = await query;
  if (missing(error)) return { available: false, threads: [] };
  if (error) fail(error, "Couldn't load the messages");
  return { available: true, threads: ((data ?? []) as unknown as ThreadRow[]).map(toThread) };
}

export async function listMessages(
  client: Client,
  threadId: string,
): Promise<{ available: boolean; messages: SupportMessage[] }> {
  const { data, error } = await client
    .from("support_messages")
    .select("id, thread_id, author_id, from_platform_admin, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (missing(error)) return { available: false, messages: [] };
  if (error) fail(error, "Couldn't load the conversation");
  return { available: true, messages: ((data ?? []) as MessageRow[]).map(toMessage) };
}

export async function openThread(
  client: Client,
  input: { householdId: string; subject: string; body: string },
): Promise<{ available: boolean; threadId: string | null }> {
  const { data, error } = await client.rpc("open_support_thread", {
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
  const { error } = await client.rpc("post_support_message", {
    p_thread_id: input.threadId,
    p_body: input.body.trim(),
  });
  if (missing(error)) return { available: false };
  if (error) fail(error, "Couldn't send your message");
  return { available: true };
}

export async function markRead(client: Client, threadId: string): Promise<{ available: boolean }> {
  const { error } = await client.rpc("mark_support_thread_read", { p_thread_id: threadId });
  if (missing(error)) return { available: false };
  if (error) fail(error, "Couldn't mark the conversation read");
  return { available: true };
}

export async function setThreadStatus(
  client: Client,
  input: { threadId: string; status: SupportStatus },
): Promise<{ available: boolean }> {
  const { error } = await client.rpc("set_support_thread_status", {
    p_thread_id: input.threadId,
    p_status: input.status,
  });
  if (missing(error)) return { available: false };
  if (error) fail(error, "Couldn't change the conversation");
  return { available: true };
}

export const listThreadsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; scope: SupportSide; householdId?: string }) => data)
  .handler(({ data }) =>
    listThreads(createAuthedClient(data.token), {
      scope: data.scope,
      householdId: data.householdId,
    }),
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

export const setThreadStatusFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; threadId: string; status: SupportStatus }) => data)
  .handler(({ data }) =>
    setThreadStatus(createAuthedClient(data.token), {
      threadId: data.threadId,
      status: data.status,
    }),
  );
