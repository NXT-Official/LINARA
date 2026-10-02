import { useCallback, useEffect, useState } from "react";

import { listCommentActivityFn, type CommentActivity } from "../task.actions";

/** Updates have no realtime channel (ticket_comments isn't published), so poll. */
const POLL_MS = 30_000;
const SEEN_KEY = "linara.commentsSeen";

export type CommentActivityStore = {
  activity: Record<string, CommentActivity>;
  /** True when someone else wrote the latest update and this device hasn't opened it since. */
  isNew: (ticketId: string) => boolean;
  markSeen: (ticketId: string) => void;
  refresh: () => void;
};

const readSeen = (): Record<string, string> => {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
};

const writeSeen = (seen: Record<string, string>) => {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // ignore: "new" just won't survive a reload
  }
};

/**
 * Which tasks have updates, for the badges on task cards (client feedback,
 * 2026-10-02: updates the helper added weren't being noticed). "Seen" is per
 * device, in localStorage: it only decides whether a badge is highlighted.
 */
export function useCommentActivity({
  token,
  myUserId,
  ready,
}: {
  token: string | null;
  myUserId: string | null;
  ready: boolean;
}): CommentActivityStore {
  const [activity, setActivity] = useState<Record<string, CommentActivity>>({});
  const [seen, setSeen] = useState<Record<string, string>>({});

  useEffect(() => setSeen(readSeen()), []);

  const refresh = useCallback(() => {
    if (!token) return;
    listCommentActivityFn({ data: { token } })
      .then(setActivity)
      .catch((err) => console.error("[useCommentActivity] Failed to load updates:", err));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [ready, token, refresh]);

  const markSeen = useCallback((ticketId: string) => {
    setSeen((prev) => {
      const next = { ...prev, [ticketId]: new Date().toISOString() };
      writeSeen(next);
      return next;
    });
  }, []);

  const isNew = (ticketId: string) => {
    const a = activity[ticketId];
    if (!a || !a.lastAuthorId || a.lastAuthorId === myUserId) return false;
    const seenAt = seen[ticketId];
    return !seenAt || seenAt < a.lastAt;
  };

  return { activity, isNew, markSeen, refresh };
}
