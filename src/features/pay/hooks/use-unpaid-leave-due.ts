import { useCallback, useEffect, useState } from "react";

import { getUnpaidLeaveDueFn, type UnpaidLeaveDue } from "../pay.actions";

type Span = { helperId: string; cutoffEnd: string; final?: boolean };

const key = (helperId: string, cutoffEnd: string) => `${helperId}|${cutoffEnd}`;
const NONE: UnpaidLeaveDue = { days: 0, deduction: 0 };

/**
 * The unpaid leave each cutoff's payslip would take, asked of Postgres
 * (getUnpaidLeaveDueFn), for estimates that must match what the payout
 * deducts. `version` is a value whose identity changes when leave or payslips do, so
 * an approval or a payment refetches. Returns a lookup; a span still loading
 * reads as none.
 */
export function useUnpaidLeaveDue(token: string | null, spans: Span[], version?: unknown) {
  const [due, setDue] = useState<Record<string, UnpaidLeaveDue>>({});
  // Spans arrive as a fresh array every render; this string is what changes.
  const signature = spans.map((s) => `${s.helperId}|${s.cutoffEnd}|${s.final ? 1 : 0}`).join(",");

  useEffect(() => {
    if (!token || !signature) return;
    let cancelled = false;
    const items = signature.split(",").map((part) => {
      const [helperId, cutoffEnd, final] = part.split("|");
      return { helperId, cutoffEnd, final: final === "1" };
    });
    getUnpaidLeaveDueFn({ data: { token, items } })
      .then((rows) => {
        if (cancelled) return;
        setDue(
          Object.fromEntries(items.map((item, i) => [key(item.helperId, item.cutoffEnd), rows[i]])),
        );
      })
      .catch((err) => {
        console.error("[useUnpaidLeaveDue] Failed to read unpaid leave:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [token, signature, version]);

  return useCallback(
    (helperId: string, cutoffEnd: string | undefined): UnpaidLeaveDue =>
      (cutoffEnd ? due[key(helperId, cutoffEnd)] : undefined) ?? NONE,
    [due],
  );
}
