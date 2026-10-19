export type SupportStatus = "open" | "pending" | "resolved" | "closed";

/** One in-app request in the console's ticket queue, as the household sees it. */
export type SupportThread = {
  id: string;
  /** Shown as LIN-<ref>. */
  ref: number;
  subject: string;
  status: SupportStatus;
  createdAt: string;
  /** Null until the first line is posted. */
  lastMessageAt: string | null;
  householdUnread: number;
};

export type SupportMessage = {
  id: string;
  ticketId: string;
  /** Null for a staff line (the console's staff are not household users). */
  authorId: string | null;
  fromStaff: boolean;
  body: string;
  createdAt: string;
};

export const STATUS_LABEL: Record<SupportStatus, string> = {
  open: "Open",
  pending: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

export const ticketRef = (ref: number): string => `LIN-${ref}`;
