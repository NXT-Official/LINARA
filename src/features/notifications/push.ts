import type { SupabaseClient } from "@supabase/supabase-js";

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
 */
export type HelperPush = {
  title: string;
  body: string;
  /** Mobile route to open on tap. */
  url: "/today" | "/week";
  urgent?: boolean;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export async function pushToHelper(
  client: SupabaseClient,
  helperId: string,
  push: HelperPush,
): Promise<void> {
  try {
    // Managers only, same household only -- enforced by the RPC
    // (supabase/add-push-tokens.sql).
    const { data: tokens, error } = await client.rpc("helper_push_tokens", {
      p_helper_id: helperId,
    });
    if (error) {
      console.error("[push] Could not read push tokens:", error.message);
      return;
    }
    if (!tokens || tokens.length === 0) return;

    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    // Only needed once "Enhanced push security" is switched on for the Expo project.
    if (process.env.EXPO_ACCESS_TOKEN) {
      headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
    }

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(
        (tokens as string[]).map((to) => ({
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
    if (!res.ok) {
      console.error("[push] Expo push service answered", res.status, await res.text());
    }
  } catch (err) {
    console.error("[push] Push not sent:", err);
  }
}
