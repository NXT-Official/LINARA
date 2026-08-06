import { useState } from "react";

import { helperById } from "@/features/people/people.utils";

import type { QuickUtos } from "../utos.types";

export type SendFlags = {
  afterHours?: boolean;
  emergency?: boolean;
  waiting?: boolean;
  from?: string;
};

export type UtosStore = ReturnType<typeof useUtos>;

/**
 * The day's quick utos.
 *
 * Deliberately ephemeral: `clearForNewDay` genuinely deletes them — there is no
 * history array and no log, only a note that the list was wiped.
 */
export function useUtos({
  toHelperId,
  onDone,
  onAction,
}: {
  toHelperId: string;
  /** Fired when the helper taps Done — the app decides if it is owed back. */
  onDone: (utos: QuickUtos) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAction?: (action: { type: string; payload: any }) => void;
}) {
  const [list, setList] = useState<QuickUtos[]>([]);
  const [wipedToday, setWipedToday] = useState(false);

  const send = (content: string, flags: SendFlags = {}) => {
    const generatedId = `u${Date.now()}`;
    const newUto: QuickUtos = {
      id: generatedId,
      content,
      from: flags.from ?? "Manager",
      to: helperById(toHelperId).name,
      timestamp: Date.now(),
      ackState: "sent",
      afterHours: flags.afterHours,
      emergency: flags.emergency,
      waiting: flags.waiting,
    };
    setList((prev) => [...prev, newUto]);
    setWipedToday(false);
    onAction?.({ type: "SEND_UTO", payload: { uto: newUto } });
  };

  const ack = (id: string, state: "seen" | "done") => {
    setList((prev) => {
      const u = prev.find((x) => x.id === id);
      if (u && state === "done") onDone(u);
      return prev.map((x) => (x.id === id ? { ...x, ackState: state } : x));
    });
    onAction?.({ type: "ACK_UTO", payload: { id, state } });
  };

  const clearForNewDay = () => {
    const wasWiped = list.length > 0;
    setWipedToday(wasWiped);
    setList([]);
    onAction?.({ type: "CLEAR_UTOS", payload: { wasWiped } });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const receiveAction = (action: { type: string; payload: any }) => {
    switch (action.type) {
      case "SEND_UTO": {
        const { uto } = action.payload;
        setList((prev) => {
          if (prev.some((u) => u.id === uto.id)) return prev;
          return [...prev, uto];
        });
        setWipedToday(false);
        break;
      }
      case "ACK_UTO": {
        const { id, state } = action.payload;
        setList((prev) => {
          const u = prev.find((x) => x.id === id);
          if (u && state === "done" && u.ackState !== "done") onDone(u);
          return prev.map((x) => (x.id === id ? { ...x, ackState: state } : x));
        });
        break;
      }
      case "CLEAR_UTOS": {
        const { wasWiped } = action.payload;
        setWipedToday(wasWiped);
        setList([]);
        break;
      }
    }
  };

  return { list, wipedToday, send, ack, clearForNewDay, receiveAction };
}
