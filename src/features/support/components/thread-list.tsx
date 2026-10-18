import { unreadFor, type SupportSide, type SupportThread } from "../support.types";
import { fmtSupportTime, sortThreads } from "../support.utils";

export function ThreadList({
  threads,
  me,
  selectedId,
  onSelect,
}: {
  threads: SupportThread[];
  me: SupportSide;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-border/60">
      {sortThreads(threads, me).map((t) => {
        const unread = unreadFor(t, me) > 0;
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onSelect(t.id)}
              aria-current={t.id === selectedId ? "true" : undefined}
              className={`flex w-full items-center gap-3 px-1 py-3 text-left transition hover:bg-muted/40 ${
                t.id === selectedId ? "bg-muted/60" : ""
              }`}
            >
              <span className="min-w-0 flex-1">
                {me === "platform_admin" && t.householdName && (
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {t.householdName}
                  </span>
                )}
                <span
                  className={`block truncate text-sm ${
                    unread ? "font-semibold text-foreground" : "text-foreground"
                  }`}
                >
                  {t.subject}
                </span>
                <span className="block text-[13px] text-muted-foreground">
                  {fmtSupportTime(t.lastMessageAt)}
                </span>
              </span>
              {unread && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
                  role="img"
                  aria-label="Unread"
                />
              )}
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${
                  t.status === "open"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {t.status === "open" ? "Open" : "Closed"}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
