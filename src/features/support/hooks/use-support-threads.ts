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
    // Realtime never sees global.headers: it joins with the session's token or,
    // with no session (this client keeps none), the anon key, and anon can't
    // read the support tables, so no change would ever arrive. Hand it the
    // token first; setAuth(token) stores it synchronously and sends it on join.
    // src: https://unpkg.com/@supabase/supabase-js@2.111.0/dist/index.mjs (SupabaseClient: realtime gets accessToken: _getAccessToken, the session token or the anon key) · 2.111.0 · 2026-10-19
    // src: https://unpkg.com/@supabase/realtime-js@2.111.0/dist/module/RealtimeClient.js (options.headers ignored; setAuth(token) -> _performAuth sets accessTokenValue, a manual token) · 2.111.0 · 2026-10-19
    client.realtime.setAuth(token).catch(() => {
      // Live updates only: without them the list still loads and refreshes on demand.
    });
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
