import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

import { EMPTY_SCOPE, LARGE_STAFF, NO_TEAM } from "../teams.constants";
import type { StaffScope } from "../teams.types";
import { useTeamView } from "./use-team-view";
import { filterStaff, groupByTeam, isScoped, type StaffGroup } from "../teams.utils";

// The team, labels and grouping a manager picks follow them from tab to tab
// on this device: someone who runs the Kitchen picks it once. The search box
// is each view's own and isn't remembered.
const KEY = "linara.staffScope";
type Saved = Omit<StaffScope, "query">;
const SAVED_EMPTY: Saved = { teamId: null, labelIds: [], groupBy: "team" };

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached: Saved = SAVED_EMPTY;

function read(): Saved {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Private window or blocked storage: nothing remembered.
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<Saved>) : {};
    cached = {
      teamId: typeof parsed.teamId === "string" ? parsed.teamId : null,
      labelIds: Array.isArray(parsed.labelIds)
        ? parsed.labelIds.filter((x): x is string => typeof x === "string")
        : [],
      groupBy: parsed.groupBy === "none" ? "none" : "team",
    };
  } catch {
    cached = SAVED_EMPTY;
  }
  return cached;
}

function write(next: Saved) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  cachedRaw = undefined;
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cachedRaw = undefined;
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Which staff a view shows and how it groups them, with the filtering done.
 * `show` is false for a small household with no teams: it keeps the simple
 * views it has always had, and nothing is filtered.
 */
export function useStaffScope() {
  const { teams, activeCount, coversByHelper, inUse } = useTeamView();
  const saved = useSyncExternalStore(subscribe, read, () => SAVED_EMPTY);
  const [query, setQuery] = useState("");

  // Search needs nothing from the database; teams and labels need
  // add-teams-and-labels.sql (and ids saved from before are ignored without it).
  // Teams and labels count once someone is in them: a household that made
  // "Kitchen" but put nobody in it still has two helpers, not something to
  // filter (UX review 2026-10-07).
  const show =
    activeCount > LARGE_STAFF ||
    (teams.available && (inUse.teamIds.size > 0 || inUse.labelIds.size > 0));
  const hasTeams = show && inUse.teamIds.size > 0;
  const teamsInUse = useMemo(
    () => teams.teams.filter((t) => inUse.teamIds.has(t.id)),
    [teams.teams, inUse.teamIds],
  );
  const labelsInUse = useMemo(
    () => teams.labels.filter((l) => inUse.labelIds.has(l.id)),
    [teams.labels, inUse.labelIds],
  );
  // A saved team or label nobody is in any more stops applying, so the list
  // can't be narrowed by a filter the bar no longer shows.
  const scope: StaffScope = show
    ? {
        ...saved,
        query,
        teamId:
          saved.teamId &&
          (inUse.teamIds.has(saved.teamId) || (hasTeams && saved.teamId === NO_TEAM))
            ? saved.teamId
            : null,
        labelIds: saved.labelIds.filter((id) => inUse.labelIds.has(id)),
      }
    : EMPTY_SCOPE;

  const known = inUse;

  const update = useCallback((patch: Partial<StaffScope>) => {
    const { query: q, ...rest } = patch;
    if (q !== undefined) setQuery(q);
    if (Object.keys(rest).length > 0) write({ ...read(), ...rest });
  }, []);

  const apply = useCallback(
    <T extends { id: string; name: string; teamId?: string | null }>(items: T[]) =>
      show ? filterStaff(items, scope, teams.labelIdsByHelper, known, coversByHelper) : items,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      show,
      scope.query,
      scope.teamId,
      scope.labelIds,
      teams.labelIdsByHelper,
      known,
      coversByHelper,
    ],
  );

  /** Groups by team when grouping is on and the household has teams; else one group. */
  const group = useCallback(
    <T extends { id: string; name: string; teamId?: string | null }>(
      items: T[],
    ): StaffGroup<T>[] | null =>
      hasTeams && scope.groupBy === "team" ? groupByTeam(items, teamsInUse) : null,
    [hasTeams, scope.groupBy, teamsInUse],
  );

  return {
    /** Offer search, filters and grouping. */
    show,
    hasTeams,
    /** What the bar offers: only teams and labels someone is in. */
    teamsInUse,
    labelsInUse,
    scope,
    update,
    clear: () => update({ query: "", teamId: null, labelIds: [] }),
    /** A team or label is narrowing the list (search aside). */
    scoped: show && isScoped(scope),
    apply,
    group,
  };
}

export type StaffScopeApi = ReturnType<typeof useStaffScope>;
