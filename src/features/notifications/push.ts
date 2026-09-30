import type { SupabaseClient } from "@supabase/supabase-js";

import {
  deadFromReceipts,
  receiptIdsToCheck,
  settleTickets,
  toStoredTokens,
  type ExpoReceipt,
  type ExpoTicket,
} from "./push.utils";

/**
 * Push notifications to a helper's phone (KNOWN_GAPS.md O7). Server-side only:
 * called from inside server-function handlers, after the write they announce
 * has succeeded.
 *
 * When to push is the caller's decision, and the concept doc's "no pings after
 * hours" rule narrows it to two cases:
 *   - a manager's explicit override or emergency send through the friction
 *     wall (the wall already asked them, so the push is what they chose);
 *   - an appointment move that shifts her tasks, only while she is reachable.
 *     Off shift she sees the heads-up on Today the next time she opens the app.
 * Ordinary sends while she is on shift don't push: Realtime already delivers
 * them to an open app, and a buzz for every task is the surveillance feel the
 * brand avoids.
 *
 * A push that fails never fails the write: the item is already saved and she
 * will see it in the app.
 *
 * Phones Expo reports as gone (DeviceNotRegistered) are deleted, from this
 * send's tickets or the previous send's receipts, so a reinstall or a new
 * phone doesn't leave a dead token behind forever.
 */
export type HelperPush = {
  title: string;
  body: string;
  /** Mobile route to open on tap. */
  url: "/today" | "/week";
  urgent?: boolean;
};

const EXPO_API = "https://exp.host/--/api/v2/push";

function expoHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  // Only needed once "Enhanced push security" is switched on for the Expo project.
  if (process.env.EXPO_ACCESS_TOKEN) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }
  return headers;
}

/**
 * Receipts for the previous send to this helper. Expo only knows a phone is
 * gone some minutes after a push, and there's no scheduler to come back
 * later, so each send checks the last one's receipts first.
 */
async function fetchReceipts(ids: string[]): Promise<Record<string, ExpoReceipt>> {
  if (ids.length === 0) return {};
  const res = await fetch(`${EXPO_API}/getReceipts`, {
    method: "POST",
    headers: expoHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) return {};
  const json = (await res.json()) as { data?: Record<string, ExpoReceipt> };
  return json.data ?? {};
}

export async function pushToHelper(
  client: SupabaseClient,
  helperId: string,
  push: HelperPush,
): Promise<void> {
  try {
    // Managers only, same household only -- enforced by the RPC
    // (supabase/add-push-tokens.sql, add-push-token-pruning.sql).
    const { data: rows, error } = await client.rpc("helper_push_tokens", {
      p_helper_id: helperId,
    });
    if (error) {
      console.error("[push] Could not read push tokens:", error.message);
      return;
    }
    const tokens = toStoredTokens((rows ?? []) as unknown[]);
    if (tokens.length === 0) return;

    const deadBefore = deadFromReceipts(
      tokens,
      await fetchReceipts(receiptIdsToCheck(tokens, Date.now())).catch(() => ({})),
    );
    const sendTo = tokens.map((t) => t.token).filter((t) => !deadBefore.includes(t));

    let tickets: ExpoTicket[] = [];
    if (sendTo.length > 0) {
      const res = await fetch(`${EXPO_API}/send`, {
        method: "POST",
        headers: expoHeaders(),
        body: JSON.stringify(
          sendTo.map((to) => ({
            to,
            title: push.title,
            body: push.body,
            data: { url: push.url },
            sound: "default",
            priority: push.urgent ? "high" : "default",
            // Created by the mobile app (lib/notifications.ts).
            channelId: "alerts",
          })),
        ),
      });
      if (res.ok) {
        tickets = ((await res.json()) as { data?: ExpoTicket[] }).data ?? [];
      } else {
        console.error("[push] Expo push service answered", res.status, await res.text());
      }
    }

    const settled = settleTickets(sendTo, tickets);
    const dead = [...deadBefore, ...settled.dead];
    if (dead.length > 0 || settled.sent.length > 0) {
      const { error: settleError } = await client.rpc("settle_helper_push_tokens", {
        p_helper_id: helperId,
        p_dead: dead,
        p_sent: settled.sent,
      });
      if (settleError) console.error("[push] Tokens not updated:", settleError.message);
    }
  } catch (err) {
    console.error("[push] Push not sent:", err);
  }
}
