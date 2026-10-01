import { Loader2, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { householdTimeZone } from "@/lib/time";

import {
  addTicketCommentFn,
  deleteTicketCommentFn,
  listTicketCommentsFn,
  type TicketComment,
} from "../task.actions";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: householdTimeZone(),
  });

/**
 * A task's thread of updates (supabase/add-ticket-comments.sql). The helper
 * it's assigned to sees the same thread in her app, and can add to it.
 */
export function TaskUpdates({
  token,
  ticketId,
  myUserId,
}: {
  token: string;
  ticketId: string;
  myUserId: string | null;
}) {
  const [comments, setComments] = useState<TicketComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listTicketCommentsFn({ data: { token, ticketId } })
      .then((rows) => !cancelled && setComments(rows))
      .catch((err) => {
        console.error("[TaskUpdates] Failed to load updates:", err);
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [token, ticketId]);

  const post = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const added = await addTicketCommentFn({ data: { token, ticketId, body: draft } });
      setComments((prev) => [...(prev ?? []), added]);
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't post the update.");
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteTicketCommentFn({ data: { token, commentId: id } });
      setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete it.");
    }
  };

  return (
    <section aria-label="Updates">
      <h4 className="text-sm font-semibold text-foreground">Updates</h4>
      {comments === null ? (
        <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted-foreground" />
      ) : comments.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          No updates yet. Whoever this task is assigned to sees them in the app, and can reply.
        </p>
      ) : (
        <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-secondary/60 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {c.authorName || "Someone"}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {stamp(c.createdAt)}
                  {c.editedAt ? " · edited" : ""}
                  {c.authorId === myUserId && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      aria-label="Delete this update"
                      className="ml-1 rounded p-0.5 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              </div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={1000}
          placeholder="Add an update…"
          className="min-w-0 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={post}
          disabled={posting || !draft.trim()}
          aria-label="Post update"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
        >
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </section>
  );
}
