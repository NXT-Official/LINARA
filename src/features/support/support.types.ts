export type SupportStatus = "open" | "closed";

/** Which side of the conversation the signed-in person is on. */
export type SupportSide = "household" | "platform_admin";

export type SupportThread = {
  id: string;
  householdId: string;
  /** Only the admin inbox joins the household's name. */
  householdName: string | null;
  subject: string;
  status: SupportStatus;
  createdAt: string;
  lastMessageAt: string;
  householdUnread: number;
  platformAdminUnread: number;
};

export type SupportMessage = {
  id: string;
  threadId: string;
  authorId: string;
  fromPlatformAdmin: boolean;
  body: string;
  createdAt: string;
};

/** Unread lines waiting for this side. */
export const unreadFor = (thread: SupportThread, side: SupportSide): number =>
  side === "platform_admin" ? thread.platformAdminUnread : thread.householdUnread;
