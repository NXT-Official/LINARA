import { useState } from "react";

import type { ValeRequest } from "../ledger.types";

export type ValeStore = ReturnType<typeof useVales>;

/** Cash-advance requests: the helper asks, any manager approves or declines. */
export function useVales() {
  const [vales, setVales] = useState<ValeRequest[]>([]);

  return {
    vales,
    request: (helperId: string, amount: number, reason: string) =>
      setVales((prev) => [
        ...prev,
        { id: `v${Date.now()}`, helperId, amount, reason, status: "pending" },
      ]),
    decide: (id: string, decision: "approved" | "declined") =>
      setVales((prev) => prev.map((v) => (v.id === id ? { ...v, status: decision } : v))),
  };
}
