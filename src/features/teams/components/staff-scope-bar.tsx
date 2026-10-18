import { Layers, Search, X } from "lucide-react";
import { useState } from "react";

import type { StaffScopeApi } from "../hooks/use-staff-scope";
import { NO_TEAM } from "../teams.constants";

const LABELS_SHOWN = 8;

/**
 * Search, team, labels and grouping over a list of staff. The team, labels
 * and grouping follow the manager from tab to tab (useStaffScope); the
 * search is this view's own. Renders nothing for a small household where
 * nobody is in a team or label.
 */
export function StaffScopeBar({
  api,
  shown,
  total,
  noun = ["helper", "helpers"],
  searchLabel = "Search staff by name",
}: {
  api: StaffScopeApi;
  /** How many the filters let through, and how many there are. */
  shown: number;
  total: number;
  noun?: [string, string];
  searchLabel?: string;
}) {
  const [allLabels, setAllLabels] = useState(false);
  if (!api.show) return null;
  const { scope, update, teamsInUse, labelsInUse } = api;
  const labels = allLabels ? labelsInUse : labelsInUse.slice(0, LABELS_SHOWN);
  const hidden = labelsInUse.length - labels.length;
  const filtered = api.scoped || scope.query.trim() !== "";

  const toggleLabel = (id: string) =>
    update({
      labelIds: scope.labelIds.includes(id)
        ? scope.labelIds.filter((x) => x !== id)
        : [...scope.labelIds, id],
    });

  return (
    <div className="space-y-2 rounded-2xl bg-card p-3 shadow-soft ring-1 ring-border/20">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[10rem] flex-1 items-center gap-2 rounded-xl border border-input bg-background px-3 focus-within:border-primary">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={scope.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Search by name…"
            aria-label={searchLabel}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {scope.query && (
            <button
              type="button"
              onClick={() => update({ query: "" })}
              aria-label="Clear search"
              className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {api.hasTeams && (
          <select
            value={scope.teamId ?? ""}
            onChange={(e) => update({ teamId: e.target.value || null })}
            aria-label="Show one team"
            className="rounded-xl border border-input bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-primary"
          >
            <option value="">Every team</option>
            {teamsInUse.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value={NO_TEAM}>No team</option>
          </select>
        )}
        {api.hasTeams && (
          <button
            type="button"
            onClick={() => update({ groupBy: scope.groupBy === "team" ? "none" : "team" })}
            aria-pressed={scope.groupBy === "team"}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${
              scope.groupBy === "team"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="h-3.5 w-3.5" /> By team
          </button>
        )}
      </div>

      {labelsInUse.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Labels">
          {labels.map((l) => {
            const on = scope.labelIds.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleLabel(l.id)}
                aria-pressed={on}
                className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {l.name}
              </button>
            );
          })}
          {(hidden > 0 || allLabels) && labelsInUse.length > LABELS_SHOWN && (
            <button
              type="button"
              onClick={() => setAllLabels((v) => !v)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/5"
            >
              {allLabels ? "Fewer labels" : `${hidden} more`}
            </button>
          )}
        </div>
      )}

      {filtered && (
        <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
          <span>
            Showing <span className="font-semibold text-foreground tabular-nums">{shown}</span> of{" "}
            <span className="tabular-nums">{total}</span> {total === 1 ? noun[0] : noun[1]}
          </span>
          <button
            type="button"
            onClick={api.clear}
            className="font-semibold text-primary hover:underline"
          >
            Show everyone
          </button>
        </div>
      )}
    </div>
  );
}
