import { STATUS_LABEL, ticketRef, type SupportThread } from "../support.types";
import { fmtSupportTime, sortThreads, statusPillClass } from "../support.utils";

export function ThreadList({
  threads,
  selectedId,
  onSelect,
}: {
  threads: SupportThread[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-border/60">
      {sortThreads(threads).map((t) => {
        const unread = t.householdUnread > 0;
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
                <span className="block truncate text-[13px] text-muted-foreground">
                  {ticketRef(t.ref)}
                </span>
                <span
                  className={`block truncate text-sm ${
                    unread ? "font-semibold text-foreground" : "text-foreground"
                  }`}
                >
                  {t.subject}
                </span>
                <span className="block text-[13px] text-muted-foreground">
                  {fmtSupportTime(t.lastMessageAt ?? t.createdAt)}
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
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-semibold ${statusPillClass(t.status)}`}
              >
                {STATUS_LABEL[t.status]}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
