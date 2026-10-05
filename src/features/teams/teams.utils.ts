import { NO_TEAM } from "./teams.constants";
import type { StaffScope, Team } from "./teams.types";

/** Anything that is, or belongs to, one helper: a Helper, an Invite, a payroll row. */
type Staff = { id: string; name: string; teamId?: string | null };

export type StaffGroup<T> = {
  /** The team's id, or NO_TEAM. */
  key: string;
  title: string;
  team: Team | null;
  items: T[];
};

/** Case-insensitive, on any word of the name: "ros" finds "Ate Rosa". */
export function nameMatches(name: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || name.toLowerCase().includes(q);
}

/**
 * The staff a scope lets through: name search, one team (or "no team"), and
 * every chosen label. A team or label that no longer exists is ignored rather
 * than hiding everyone.
 */
export function filterStaff<T extends Staff>(
  items: T[],
  scope: StaffScope,
  labelIdsByHelper: Map<string, string[]>,
  known: { teamIds: Set<string>; labelIds: Set<string> },
): T[] {
  const teamId =
    scope.teamId === NO_TEAM || (scope.teamId && known.teamIds.has(scope.teamId))
      ? scope.teamId
      : null;
  const labelIds = scope.labelIds.filter((id) => known.labelIds.has(id));
  return items.filter((item) => {
    if (!nameMatches(item.name, scope.query)) return false;
    if (teamId === NO_TEAM && item.teamId) return false;
    if (teamId && teamId !== NO_TEAM && item.teamId !== teamId) return false;
    if (labelIds.length > 0) {
      const has = labelIdsByHelper.get(item.id) ?? [];
      if (!labelIds.every((id) => has.includes(id))) return false;
    }
    return true;
  });
}

/**
 * Groups by team, teams in name order and "No team" last; empty groups are
 * left out. Items keep the order they came in.
 */
export function groupByTeam<T extends Staff>(items: T[], teams: Team[]): StaffGroup<T>[] {
  const byTeam = new Map<string, T[]>();
  const known = new Set(teams.map((t) => t.id));
  for (const item of items) {
    const key = item.teamId && known.has(item.teamId) ? item.teamId : NO_TEAM;
    byTeam.set(key, [...(byTeam.get(key) ?? []), item]);
  }
  const groups: StaffGroup<T>[] = [...teams]
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((team) => {
      const list = byTeam.get(team.id);
      return list ? [{ key: team.id, title: team.name, team, items: list }] : [];
    });
  const none = byTeam.get(NO_TEAM);
  if (none) groups.push({ key: NO_TEAM, title: "No team", team: null, items: none });
  return groups;
}

/** True when the scope narrows anything (the search box aside). */
export function isScoped(scope: StaffScope): boolean {
  return scope.teamId !== null || scope.labelIds.length > 0;
}
