import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ackUtoFn, insertUtoFn, listUtosFn, type QuickUtosRow } from "../utos.actions";
import type { QuickUtos } from "../utos.types";

export type SendFlags = {
  afterHours?: boolean;
  emergency?: boolean;
  waiting?: boolean;
  from?: string;
};

export type UtosStore = ReturnType<typeof useUtos>;

function toQuickUtos(row: QuickUtosRow, toHelperName: string): QuickUtos {
  return {
    id: row.id,
    content: row.content,
    from: row.sender_name,
    to: toHelperName,
    toHelperId: row.recipient_id,
    timestamp: new Date(row.created_at).getTime(),
    ackState: row.ack_state,
    afterHours: row.after_hours,
    emergency: row.emergency,
    waiting: row.waiting,
  };
}

/**
 * The day's quick utos for one recipient.
 *
 * Deliberately ephemeral -- there is no history array and no log. Real
 * Supabase-backed as of KNOWN_GAPS.md gap #6 -- send()/ack() write through to
 * `quick_utos` and refetch, same "write then refresh" pattern as
 * useVales/useLedger. Cross-tab/device sync now rides Postgres Realtime (see
 * app-store-provider.tsx's quick-utos-channel), which is why the old
 * broadcast-based `onAction`/`receiveAction` plumbing this hook used to have
 * is gone -- keeping both would risk the same utos appearing twice (the
 * sender's own optimistic local copy plus the realtime-delivered row, under
 * two different ids).
 *
 * The "new day" wipe is no longer this hook's job -- it only ever cleared
 * *this* recipient's utos, not every active helper's (KNOWN_GAPS.md C30);
 * `app-store-provider.tsx`'s composite `startNewDay` now clears household-wide
 * via `clearAllUtosForHelpersFn` directly and calls this hook's `refresh()`
 * afterward.
 */
export function useUtos({
  toHelperId,
  toHelperName,
  token,
  ready,
  onDone,
}: {
  /** Real helper_profiles id of the recipient -- null until a real helper has
   * claimed their account (see app-store-provider.tsx). */
  toHelperId: string | null;
  toHelperName: string;
  token: string | null;
  ready: boolean;
  /** Fired when the helper taps Done — the app decides if it is owed back. */
  onDone: (utos: QuickUtos) => void;
}) {
  const [list, setList] = useState<QuickUtos[]>([]);

  const refresh = useCallback(async () => {
    if (!token || !toHelperId) return;
    const rows = await listUtosFn({ data: { token, helperId: toHelperId } });
    setList(rows.map((row) => toQuickUtos(row, toHelperName)));
  }, [token, toHelperId, toHelperName]);

  useEffect(() => {
    if (!ready || !token || !toHelperId) return;
    refresh().catch((err) => {
      console.error("[useUtos] Failed to load quick utos:", err);
    });
  }, [ready, token, toHelperId, refresh]);

  const send = (content: string, flags: SendFlags = {}) => {
    if (!token || !toHelperId) return;
    insertUtoFn({
      data: {
        token,
        helperId: toHelperId,
        senderName: flags.from ?? "Manager",
        content,
        afterHours: flags.afterHours,
        emergency: flags.emergency,
        waiting: flags.waiting,
      },
    })
      .then(() => refresh())
      .catch((err) => {
        console.error("[useUtos] Failed to send quick utos:", err);
        toast.error("Hindi na-send ang utos.");
      });
  };

  const ack = (id: string, state: "seen" | "done") => {
    if (!token) return;
    const current = list.find((u) => u.id === id);
    ackUtoFn({ data: { token, utoId: id, state } })
      .then(() => {
        if (current && state === "done" && current.ackState !== "done") {
          onDone({ ...current, ackState: state });
        }
        return refresh();
      })
      .catch((err) => {
        console.error("[useUtos] Failed to update quick utos:", err);
        toast.error("Hindi na-save ang pag-update ng utos.");
      });
  };

  return { list, send, ack, refresh };
}
