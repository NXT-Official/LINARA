import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";

import { matchesQuery } from "@/components/shared/list-filter.utils";
import { useAppStores } from "@/features/dashboard/app-store-context";

import type { GroceryHistory } from "../grocery.types";
import { fmtPeso, monthBounds, reconcile, spentOn } from "../grocery.utils";
import { useGroceryHistory } from "../hooks/use-grocery-history";
import { RunModal } from "./run-modal";
import { RunStatusPill } from "./run-status-pill";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" });

/**
 * Past runs, a month at a time: when each closed, who went, what it cost
 * against the cash and whether the change balanced, and what was bought
 * outside any run. Opening a run shows its lines and receipts (receipts
 * are kept two months; the figures stay).
 */
export function HistoryView() {
  const { teams, activeHelpers } = useAppStores();
  const [month, setMonth] = useState(() => monthBounds(new Date()).start);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<GroceryHistory["runs"][number] | null>(null);
  const { history, state, refresh } = useGroceryHistory(month);
  const { label } = monthBounds(month);
  const isThisMonth = month.getTime() === monthBounds(new Date()).start.getTime();
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));

  const runs = history.runs.filter(
    (r) => matchesQuery(r.title, query) || r.items.some((g) => matchesQuery(g.name, query)),
  );
  const outside = history.outside.filter((g) => matchesQuery(g.name, query));
  const runsSpent = history.runs.reduce((s, r) => s + spentOn(r.items), 0);
  const outsideSpent = spentOn(history.outside);
  const navBtn =
    "grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-40";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label="Previous month"
          className={navBtn}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <div className="font-display text-lg text-foreground">{label}</div>
          {state === "ready" && (
            <div className="text-xs tabular-nums text-muted-foreground">
              {history.runs.length} {history.runs.length === 1 ? "run" : "runs"} ·{" "}
              {fmtPeso(runsSpent + outsideSpent)} spent
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={isThisMonth}
          aria-label="Next month"
          className={navBtn}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {(history.runs.length > 0 || history.outside.length > 0) && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a run or an item"
          aria-label="Search this month's runs"
          className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      )}

      {state === "loading" ? (
        <div className="grid place-items-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : state === "error" ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Couldn&apos;t load {label}.{" "}
          <button
            type="button"
            onClick={() => void refresh()}
            className="font-semibold text-primary"
          >
            Try again
          </button>
        </p>
      ) : runs.length === 0 && outside.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {query.trim() ? "Nothing matches." : `No runs closed in ${label}.`}
        </p>
      ) : (
        <>
          {runs.length > 0 && (
            <ul className="divide-y divide-border/70">
              {runs.map((r) => {
                const spent = spentOn(r.items);
                const { gap } = reconcile(r, spent);
                const who = r.shopperIds
                  .map((id) => activeHelpers.find((h) => h.id === id)?.name.split(" ")[0])
                  .filter(Boolean);
                const meta = [
                  r.closedAt && day(r.closedAt),
                  r.teamId && teams.teamById.get(r.teamId)?.name,
                  who.length > 0 && who.join(", "),
                  r.receipts.length > 0 &&
                    `${r.receipts.length} ${r.receipts.length === 1 ? "receipt" : "receipts"}`,
                ].filter(Boolean);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(r)}
                      className="flex w-full items-center gap-3 py-3 text-left hover:bg-secondary/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {r.title}
                          </span>
                          {r.status === "cancelled" && <RunStatusPill status="cancelled" />}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {meta.join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs tabular-nums">
                        {(r.status === "done" || spent > 0) && (
                          <span className="block text-foreground">
                            {fmtPeso(spent)}
                            {r.cashGiven !== null && (
                              <span className="text-muted-foreground">
                                {" "}
                                / {fmtPeso(r.cashGiven)}
                              </span>
                            )}
                          </span>
                        )}
                        {gap !== null && (
                          <span
                            className={`block font-semibold ${gap === 0 ? "text-pine-deep" : "text-[oklch(0.5_0.17_35)]"}`}
                          >
                            {gap === 0
                              ? "Balanced"
                              : gap > 0
                                ? `${fmtPeso(gap)} short`
                                : `${fmtPeso(-gap)} over`}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {outside.length > 0 && (
            <div>
              <div className="px-1 pt-2 text-xs font-semibold text-muted-foreground">
                Bought outside a run · {fmtPeso(outsideSpent)}
              </div>
              <ul className="divide-y divide-border/70">
                {outside.map((g) => (
                  <li key={g.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">
                      {g.boughtAt ? day(g.boughtAt) : ""}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-foreground">
                      {g.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        · {g.qty} {g.unit}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {g.costPHP != null ? fmtPeso(g.costPHP) : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {open && (
        <RunModal
          run={open}
          closedItems={open.items}
          closedReceipts={open.receipts}
          onClose={() => {
            setOpen(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
