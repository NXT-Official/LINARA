import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { fmtSupportTime } from "../support.utils";
import { listMessagesFn, markReadFn, postMessageFn, setThreadStatusFn } from "../support.actions";
import {
  unreadFor,
  type SupportMessage,
  type SupportSide,
  type SupportThread,
} from "../support.types";

type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "unavailable" }
  | { state: "ready"; messages: SupportMessage[] };

const BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50";
const PRIMARY = `${BUTTON} bg-primary text-primary-foreground hover:bg-primary/90`;
const SECONDARY = `${BUTTON} border border-primary/30 bg-card text-primary hover:bg-primary/5`;

/**
 * One conversation: its lines (yours on the right), a composer, and for a
 * platform admin Close / Reopen. Opening it marks it read for `me`.
 */
export function ThreadView({
  token,
  thread,
  me,
  onChanged,
}: {
  token: string;
  thread: SupportThread;
  me: SupportSide;
  onChanged: () => void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const loadMessages = useCallback(async () => {
    try {
      const reply = await listMessagesFn({ data: { token, threadId: thread.id } });
      setLoad(
        reply.available ? { state: "ready", messages: reply.messages } : { state: "unavailable" },
      );
    } catch {
      setLoad({ state: "error" });
    }
  }, [token, thread.id]);

  // A new thread starts from the loading state; a new line (lastMessageAt
  // moves) reloads quietly.
  useEffect(() => {
    setLoad({ state: "loading" });
  }, [thread.id]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages, thread.lastMessageAt]);

  const unread = unreadFor(thread, me);
  useEffect(() => {
    if (unread === 0) return;
    let live = true;
    markReadFn({ data: { token, threadId: thread.id } })
      .then(() => {
        if (live) onChangedRef.current();
      })
      .catch(() => {
        // Read state is a nicety: the counter stays up and the next open retries.
      });
    return () => {
      live = false;
    };
  }, [token, thread.id, unread]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const reply = await postMessageFn({ data: { token, threadId: thread.id, body } });
      if (!reply.available) {
        toast.error("Support chat isn't switched on yet");
        return;
      }
      setDraft("");
      await loadMessages();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send your message");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    void send();
  };

  const toggleStatus = async () => {
    setChangingStatus(true);
    try {
      await setThreadStatusFn({
        data: { token, threadId: thread.id, status: thread.status === "open" ? "closed" : "open" },
      });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change the conversation");
    } finally {
      setChangingStatus(false);
    }
  };

  return (
    <section className="rounded-3xl border border-border/40 bg-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold text-foreground">
            {thread.subject}
          </h2>
          {me === "platform_admin" && thread.householdName && (
            <p className="truncate text-sm text-muted-foreground">{thread.householdName}</p>
          )}
        </div>
        {me === "platform_admin" && (
          <button
            className={SECONDARY}
            disabled={changingStatus}
            onClick={() => void toggleStatus()}
            aria-label={thread.status === "open" ? "Close conversation" : "Reopen conversation"}
          >
            {thread.status === "open" ? "Close" : "Reopen"}
          </button>
        )}
      </div>

      <div ref={listRef} className="max-h-[50dvh] space-y-3 overflow-y-auto px-5 py-4">
        {load.state === "loading" && (
          <p role="status" className="py-6 text-center text-sm text-muted-foreground">
            Loading the conversation
          </p>
        )}
        {load.state === "error" && (
          <div role="alert" className="py-6 text-center">
            <p className="text-sm text-muted-foreground">The conversation didn't load.</p>
            <button className={`${PRIMARY} mt-3`} onClick={() => void loadMessages()}>
              Try again
            </button>
          </div>
        )}
        {load.state === "unavailable" && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Support chat isn't switched on yet.
          </p>
        )}
        {load.state === "ready" && load.messages.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>
        )}
        {load.state === "ready" &&
          load.messages.map((m) => {
            const mine = m.fromPlatformAdmin === (me === "platform_admin");
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%]">
                  <p
                    className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm ${
                      mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                    }`}
                  >
                    {m.body}
                  </p>
                  <p
                    className={`mt-1 text-[13px] text-muted-foreground ${mine ? "text-right" : ""}`}
                  >
                    {fmtSupportTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })}
      </div>

      <div className="flex items-end gap-2 border-t border-border/60 px-5 py-4">
        <textarea
          aria-label="Message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          maxLength={4000}
          placeholder="Write a message"
          className="min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          className={PRIMARY}
          disabled={sending || draft.trim() === ""}
          onClick={() => void send()}
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Send
        </button>
      </div>
    </section>
  );
}
