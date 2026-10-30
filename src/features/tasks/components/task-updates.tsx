import { Loader2, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { householdTimeZone } from "@/lib/time";

import { useCommentActivityStore } from "../comment-activity-context";
import {
  addTicketCommentFn,
  deleteTicketCommentFn,
  listTicketCommentsFn,
  type TicketComment,
} from "../task.actions";
import { useT } from "@/lib/i18n/locale-context";

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: householdTimeZone(),
  });

/** While a thread is open, check for her replies this often. */
const THREAD_POLL_MS = 15_000;

/**
 * A task's thread of updates (supabase/add-ticket-comments.sql). The helper
 * it's assigned to sees the same thread in her app, and can add to it.
 * Opening it marks it seen, which clears the "new" on the task's card.
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
  const t = useT();
  const [comments, setComments] = useState<TicketComment[] | null>(null);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  const { markSeen, refresh: refreshActivity } = useCommentActivityStore();

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listTicketCommentsFn({ data: { token, ticketId } })
        .then((rows) => {
          if (cancelled) return;
          setComments(rows);
          markSeen(ticketId);
        })
        .catch((err) => {
          console.error("[TaskUpdates] Failed to load updates:", err);
          if (!cancelled) setComments((prev) => prev ?? []);
        });
    void load();
    const timer = window.setInterval(load, THREAD_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, ticketId, markSeen]);

  const post = async () => {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const added = await addTicketCommentFn({ data: { token, ticketId, body: draft } });
      setComments((prev) => [...(prev ?? []), added]);
      setDraft("");
      refreshActivity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tasks.couldntPostUpdate"));
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteTicketCommentFn({ data: { token, commentId: id } });
      setComments((prev) => (prev ?? []).filter((c) => c.id !== id));
      refreshActivity();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("tasks.couldntDeleteIt"));
    }
  };

  return (
    <section aria-label={t("tasks.updates")}>
      <h4 className="text-sm font-semibold text-foreground">{t("tasks.updates")}</h4>
      {comments === null ? (
        <Loader2 className="mt-2 h-4 w-4 animate-spin text-muted-foreground" />
      ) : comments.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">{t("tasks.noUpdatesYetWhoeverThis")}</p>
      ) : (
        <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-secondary/60 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {c.authorName || t("tasks.someone")}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {stamp(c.createdAt)}
                  {c.editedAt ? t("tasks.dotEdited") : ""}
                  {c.authorId === myUserId && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      aria-label={t("tasks.deleteThisUpdate")}
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
          placeholder={t("tasks.addAnUpdate")}
          className="min-w-0 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={post}
          disabled={posting || !draft.trim()}
          aria-label={t("tasks.postUpdate")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
        >
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </section>
  );
}
