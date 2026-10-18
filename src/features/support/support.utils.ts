import { unreadFor, type SupportSide, type SupportThread } from "./support.types";

export const fmtSupportTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Unread first, then the most recent line first. */
export function sortThreads(threads: SupportThread[], me: SupportSide): SupportThread[] {
  return [...threads].sort((a, b) => {
    const unread = Number(unreadFor(b, me) > 0) - Number(unreadFor(a, me) > 0);
    if (unread !== 0) return unread;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });
}
