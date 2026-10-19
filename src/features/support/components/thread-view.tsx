import { Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

import { fmtSupportTime, statusPillClass } from "../support.utils";
import { listMessagesFn, markReadFn, postMessageFn } from "../support.actions";
import { STATUS_LABEL, ticketRef, type SupportMessage, type SupportThread } from "../support.types";

type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "unavailable" }
  | { state: "ready"; messages: SupportMessage[] };

const BUTTON =
  "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50";
const PRIMARY = `${BUTTON} bg-primary text-primary-foreground hover:bg-primary/90`;

/**
 * One request: its lines (yours on the right) and a composer. Replying to a
 * resolved or closed request reopens it (the SQL does that). Opening it marks
 * it read.
 */
export function ThreadView({
  token,
  thread,
  onChanged,
}: {
  token: string;
  thread: SupportThread;
  onChanged: () => void;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  // Only the newest request may write: a slow reply for an earlier load (or
  // another thread) must not land under this header.
  const requestId = useRef(0);
  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  const loadMessages = useCallback(async () => {
    requestId.current += 1;
    const mine = requestId.current;
    try {
      const reply = await listMessagesFn({ data: { token, threadId: thread.id } });
      if (mine !== requestId.current) return;
      setLoad(
        reply.available ? { state: "ready", messages: reply.messages } : { state: "unavailable" },
      );
    } catch {
      if (mine === requestId.current) setLoad({ state: "error" });
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

  const unread = thread.householdUnread;
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

  return (
    <section className="rounded-3xl border border-border/40 bg-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg font-semibold text-foreground">
            {thread.subject}
          </h2>
          <p className="truncate text-[13px] text-muted-foreground">{ticketRef(thread.ref)}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${statusPillClass(thread.status)}`}
        >
          {STATUS_LABEL[thread.status]}
        </span>
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
            const mine = !m.fromStaff;
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

      {(thread.status === "resolved" || thread.status === "closed") && (
        <p className="border-t border-border/60 px-5 pt-3 text-[13px] text-muted-foreground">
          Replying reopens this request.
        </p>
      )}
      <div className="flex items-end gap-2 border-t border-border/60 px-5 py-4">
        <textarea
          aria-label="Message"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
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
