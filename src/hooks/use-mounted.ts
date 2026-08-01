import { useEffect, useState } from "react";

// True only after hydration. Guards clock/status UI that would otherwise mismatch SSR.

export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
