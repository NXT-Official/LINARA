import { useCallback, useEffect, useRef, useState } from "react";

import { createAuthedClient } from "@/lib/supabase";

import { listThreadsFn } from "../support.actions";
import type { SupportSide, SupportThread } from "../support.types";

export type SupportThreadsStatus = "loading" | "ready" | "error" | "unavailable";

/**
 * The signed-in side's conversations, kept fresh by realtime: any change to
 * either table just refetches (same "refetch on any change" as the board).
 */
export function useSupportThreads({
  token,
  scope,
  householdId,
  ready,
}: {
  token: string | null;
  scope: SupportSide;
  householdId?: string | null;
  ready: boolean;
}) {
  const [status, setStatus] = useState<SupportThreadsStatus>("loading");
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const alive = useRef(true);
  // Only the newest request may write: one new message fires two realtime
  // events, and a token or household change leaves older calls in flight.
  const requestId = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!ready || !token) return;
    requestId.current += 1;
    const mine = requestId.current;
    try {
      const reply = await listThreadsFn({
        data: { token, scope, householdId: householdId ?? undefined },
      });
      if (!alive.current || mine !== requestId.current) return;
      if (!reply.available) {
        setStatus("unavailable");
        setThreads([]);
        return;
      }
      setThreads(reply.threads);
      setStatus("ready");
    } catch {
      if (alive.current && mine === requestId.current) setStatus("error");
    }
  }, [ready, token, scope, householdId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!ready || !token) return;
    const client = createAuthedClient(token);
    // The two events of one message arrive together: one refetch covers both.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void refresh(), 150);
    };
    // A fresh topic per run: channel(name) returns any not-yet-removed channel
    // of that name, which is already joined.
    const channel = client
      .channel(`support:${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_threads" }, soon)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_messages" }, soon)
      .subscribe();
    return () => {
      clearTimeout(timer);
      void client.removeChannel(channel);
    };
  }, [ready, token, refresh]);

  const retry = useCallback(() => {
    setStatus("loading");
    return refresh();
  }, [refresh]);

  return { status, threads, refresh, retry };
}
