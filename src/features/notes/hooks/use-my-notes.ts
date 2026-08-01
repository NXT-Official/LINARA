import { useEffect, useState } from "react";

import type { MyNote } from "../note.types";

/**
 * A helper's private scratchpad, persisted per helper in localStorage.
 *
 * Writing is held back until the first read completes, so an empty initial state
 * never overwrites what is already stored.
 */
export function useMyNotes(helperId: string) {
  const storageKey = `mynotes:${helperId}`;
  const [notes, setNotes] = useState<MyNote[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setNotes(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(notes));
    } catch {
      /* ignore */
    }
  }, [storageKey, notes, hydrated]);

  const prepend = (note: Omit<MyNote, "id" | "done" | "createdAt">) =>
    setNotes((prev) => [
      { ...note, id: `n-${Date.now()}`, done: false, createdAt: Date.now() },
      ...prev,
    ]);

  return {
    notes,
    add: (text: string) => {
      const trimmed = text.trim();
      if (trimmed) prepend({ text: trimmed });
    },
    /** Mock voice note — records the held duration, clamped to a plausible 1–59s. */
    addVoice: (seconds: number) => {
      const s = Math.max(1, Math.min(seconds, 59));
      prepend({ text: `🎙️ Voice note · 0:${String(s).padStart(2, "0")}`, voice: true });
    },
    toggle: (id: string) =>
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, done: !n.done } : n))),
    remove: (id: string) => setNotes((prev) => prev.filter((n) => n.id !== id)),
  };
}
