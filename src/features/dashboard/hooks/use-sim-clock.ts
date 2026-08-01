import { useEffect, useState } from "react";

export type SimClock = {
  /** "Now" including the demo offset. Ticks every 30s. */
  nowTs: number;
  /** Milliseconds added to the real clock; null means real time. */
  offsetMs: number | null;
  setOffsetMs: (v: number | null) => void;
};

/** Prototype-only clock so the whole UI can be pushed to any hour for a demo. */
export function useSimClock(): SimClock {
  const [offsetMs, setOffsetMs] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());

  useEffect(() => {
    const tick = () => setNowTs(Date.now() + (offsetMs ?? 0));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [offsetMs]);

  return { nowTs, offsetMs, setOffsetMs };
}
