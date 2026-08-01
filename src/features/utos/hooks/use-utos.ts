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
}: {
  toHelperId: string;
  /** Fired when the helper taps Done — the app decides if it is owed back. */
  onDone: (utos: QuickUtos) => void;
}) {
  const [list, setList] = useState<QuickUtos[]>([]);
  const [wipedToday, setWipedToday] = useState(false);

  const send = (content: string, flags: SendFlags = {}) => {
    setList((prev) => [
      ...prev,
      {
        id: `u${Date.now()}`,
        content,
        from: flags.from ?? "Manager",
        to: helperById(toHelperId).name,
        timestamp: Date.now(),
        ackState: "sent",
        afterHours: flags.afterHours,
        emergency: flags.emergency,
        waiting: flags.waiting,
      },
    ]);
    setWipedToday(false);
  };

  const ack = (id: string, state: "seen" | "done") => {
    setList((prev) => {
      const u = prev.find((x) => x.id === id);
      if (u && state === "done") onDone(u);
      return prev.map((x) => (x.id === id ? { ...x, ackState: state } : x));
    });
  };

  const clearForNewDay = () => {
    setWipedToday(list.length > 0);
    setList([]);
  };

  return { list, wipedToday, send, ack, clearForNewDay };
}
