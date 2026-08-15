import { useEffect, useState } from "react";

export type SimClock = {
  /** "Now" including the demo offset. Ticks every 30s. */
  nowTs: number;
  /** Milliseconds added to the real clock; null means real time. */
  offsetMs: number | null;
  setOffsetMs: (v: number | null) => void;
};

/**
 * DISABLED 2026-08-15 (see KNOWN_GAPS.md C28) -- sim-clock.tsx's "After
 * shift · 7:00 PM" and "Rest day · Sun 10 AM" presets exactly matched every
 * new helper's default shiftEnd/restDay (invite-helper-modal.tsx: 19:00 /
 * Sunday), so clicking either during testing made every default-configured
 * helper look permanently off/resting for the rest of the session --
 * offsetMs never auto-reset. nowTs now always tracks real Date.now() for
 * every user. To re-enable for a future demo: restore the commented block
 * below in place of the two lines above it, and un-comment the <SimClock>
 * import/render in top-bar.tsx.
 */
export function useSimClock(): SimClock {
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  useEffect(() => {
    const tick = () => setNowTs(Date.now());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  return { nowTs, offsetMs: null, setOffsetMs: () => {} };

  /* --- Original sim-clock implementation, disabled but kept for re-enable ---
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  useEffect(() => {
    const tick = () => setNowTs(Date.now() + (offsetMs ?? 0));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [offsetMs]);

  return { nowTs, offsetMs, setOffsetMs };
  --- */
}
