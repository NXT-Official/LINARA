import { useEffect, useState } from "react";

import { countOpenTasksBetweenFn } from "@/features/tasks/task.actions";

import { leaveRangeIso } from "../leave.utils";

type Span = { key: string; helperId: string; startDate: string; endDate: string };

/**
 * How many unfinished tasks each span (a helper and some days) would leave
 * without anyone, keyed by `key`. Refetches when the spans change; a span
 * still loading has no entry.
 */
export function useOpenTaskCounts(token: string | null, spans: Span[]): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  // Spans arrive as a fresh array every render; this string is what changes.
  const signature = spans
    .map((s) => `${s.key}|${s.helperId}|${s.startDate}|${s.endDate}`)
    .join(",");

  useEffect(() => {
    if (!token || !signature) return;
    let cancelled = false;
    const list = signature.split(",").map((part) => {
      const [key, helperId, startDate, endDate] = part.split("|");
      return { key, helperId, startDate, endDate };
    });
    Promise.all(
      list.map(async (s) => {
        const range = leaveRangeIso(s.startDate, s.endDate);
        const n = await countOpenTasksBetweenFn({
          data: { token, helperId: s.helperId, ...range },
        });
        return [s.key, n] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) setCounts(Object.fromEntries(entries));
      })
      .catch((err) => {
        console.error("[useOpenTaskCounts] Failed to count tasks:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [token, signature]);

  return counts;
}
