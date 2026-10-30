import { MessageSquare } from "lucide-react";

import { useCommentActivityStore } from "../comment-activity-context";
import { useT } from "@/lib/i18n/locale-context";

/** How many updates a task has, highlighted when someone else wrote the latest one. */
export function CommentBadge({ taskId }: { taskId: string }) {
  const t = useT();
  const { activity, isNew } = useCommentActivityStore();
  const count = activity[taskId]?.count ?? 0;
  if (count === 0) return null;
  const fresh = isNew(taskId);
  const label = `${count} update${count === 1 ? "" : "s"}${fresh ? ", new" : ""}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-bold tabular-nums ${
        fresh ? "bg-accent text-accent-foreground" : "bg-secondary text-muted-foreground"
      }`}
    >
      <MessageSquare className="h-3 w-3" aria-hidden />
      {count}
      {fresh && <span className="font-semibold">{t("tasks.new")}</span>}
    </span>
  );
}
