import type { SupportStatus, SupportThread } from "./support.types";

export const fmtSupportTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Unread first, then the most recent line first. */
export function sortThreads(threads: SupportThread[]): SupportThread[] {
  return [...threads].sort((a, b) => {
    const unread = Number(b.householdUnread > 0) - Number(a.householdUnread > 0);
    if (unread !== 0) return unread;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
}

export const statusPillClass = (status: SupportStatus): string =>
  status === "open" || status === "pending"
    ? "bg-primary/10 text-primary"
    : "bg-muted text-muted-foreground";
