/** Shapes Expo's push service answers with (docs.expo.dev, "Sending notifications"). */
export type ExpoTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message?: string; details?: { error?: string } };

export type ExpoReceipt = { status: "ok" } | { status: "error"; details?: { error?: string } };

export type StoredToken = {
  token: string;
  lastTicketId: string | null;
  lastSentAt: string | null;
};

/** Receipts are kept for 24 hours; older ticket ids aren't worth asking about. */
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

const isDead = (r: { status: string; details?: { error?: string } } | undefined) =>
  r?.status === "error" && r.details?.error === "DeviceNotRegistered";

/**
 * helper_push_tokens returned bare strings before add-push-token-pruning.sql,
 * rows after. Accept both so the sender keeps working either side of that.
 */
export function toStoredTokens(rows: unknown[]): StoredToken[] {
  return rows.flatMap((row) => {
    if (typeof row === "string") return [{ token: row, lastTicketId: null, lastSentAt: null }];
    if (row && typeof row === "object" && typeof (row as { token?: unknown }).token === "string") {
      const r = row as {
        token: string;
        last_ticket_id?: string | null;
        last_sent_at?: string | null;
      };
      return [
        {
          token: r.token,
          lastTicketId: r.last_ticket_id ?? null,
          lastSentAt: r.last_sent_at ?? null,
        },
      ];
    }
    return [];
  });
}

/** Ticket ids from the previous send whose receipts may still be waiting. */
export function receiptIdsToCheck(tokens: StoredToken[], nowMs: number): string[] {
  return tokens
    .filter(
      (t) =>
        t.lastTicketId && t.lastSentAt && nowMs - new Date(t.lastSentAt).getTime() < RECEIPT_TTL_MS,
    )
    .map((t) => t.lastTicketId as string);
}

/** Tokens whose previous push came back DeviceNotRegistered. */
export function deadFromReceipts(
  tokens: StoredToken[],
  receipts: Record<string, ExpoReceipt>,
): string[] {
  return tokens
    .filter((t) => t.lastTicketId && isDead(receipts[t.lastTicketId]))
    .map((t) => t.token);
}

/**
 * Splits this send's tickets (same order as the messages) into tokens to
 * forget and tokens to remember a ticket id for.
 */
export function settleTickets(
  sentTo: string[],
  tickets: ExpoTicket[],
): { dead: string[]; sent: { token: string; ticketId: string }[] } {
  const dead: string[] = [];
  const sent: { token: string; ticketId: string }[] = [];
  sentTo.forEach((token, i) => {
    const ticket = tickets.at(i);
    if (!ticket) return;
    if (ticket.status === "ok") sent.push({ token, ticketId: ticket.id });
    else if (isDead(ticket)) dead.push(token);
  });
  return { dead, sent };
}
