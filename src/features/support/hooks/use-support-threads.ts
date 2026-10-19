import { useCallback, useEffect, useRef, useState } from "react";

import { listThreadsFn } from "../support.actions";
import type { SupportThread } from "../support.types";

export type SupportThreadsStatus = "loading" | "ready" | "error" | "unavailable";

/** How often the list refetches while the page is open and the tab is visible. */
export const SUPPORT_POLL_MS = 10_000;

/**
 * The household's requests, kept fresh by polling: every 10 s while mounted and
 * the tab is visible, and again when the window regains focus. The console has
 * no realtime, so there is no channel to join.
 */
export function useSupportThreads({
  token,
  householdId,
  ready,
}: {
  token: string | null;
  householdId?: string | null;
  ready: boolean;
}) {
  const [status, setStatus] = useState<SupportThreadsStatus>("loading");
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const alive = useRef(true);
  // Only the newest request may write: a tick, a focus and a manual refresh can
  // overlap, and a token or household change leaves older calls in flight.
  const requestId = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!ready || !token || !householdId) return;
    requestId.current += 1;
    const mine = requestId.current;
    try {
      const reply = await listThreadsFn({ data: { token, householdId } });
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
  }, [ready, token, householdId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!ready || !token || !householdId) return;
    const visible = () => document.visibilityState !== "hidden";
    const timer = setInterval(() => {
      if (visible()) void refresh();
    }, SUPPORT_POLL_MS);
    const onFocus = () => {
      if (visible()) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [ready, token, householdId, refresh]);

  const retry = useCallback(() => {
    setStatus("loading");
    return refresh();
  }, [refresh]);

  return { status, threads, refresh, retry };
}
