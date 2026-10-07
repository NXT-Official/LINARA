import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createLabelFn,
  createTeamFn,
  deleteLabelFn,
  deleteTeamFn,
  listTeamsAndLabelsFn,
  renameTeamFn,
  setHelpersTeamFn,
  setLabelOnHelpersFn,
  updateLabelFn,
  type TeamsSnapshot,
} from "../teams.actions";
import { LABEL_TONES } from "../teams.constants";
import type { Label, LabelTone, Team } from "../teams.types";

export type TeamStore = ReturnType<typeof useTeams>;

const EMPTY: TeamsSnapshot = { available: false, teams: [], labels: [], assignments: [] };

/**
 * The household's teams and labels, and who has which label. A helper's team
 * is on her helper_profiles row (Helper.teamId), so moving someone refreshes
 * the roster through `onRosterChange` as well as this store.
 */
export function useTeams({
  token,
  ready,
  onRosterChange,
}: {
  token: string | null;
  ready: boolean;
  onRosterChange: () => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<TeamsSnapshot>(EMPTY);

  const refresh = useCallback(async () => {
    if (!token) return;
    setSnapshot(await listTeamsAndLabelsFn({ data: { token } }));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => console.error("[useTeams] Failed to load teams:", err));
  }, [ready, token, refresh]);

  const labelIdsByHelper = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const a of snapshot.assignments) {
      map.set(a.helperId, [...(map.get(a.helperId) ?? []), a.labelId]);
    }
    return map;
  }, [snapshot.assignments]);

  const teamById = useMemo(
    () => new Map(snapshot.teams.map((t) => [t.id, t] as const)),
    [snapshot.teams],
  );
  const labelById = useMemo(
    () => new Map(snapshot.labels.map((l) => [l.id, l] as const)),
    [snapshot.labels],
  );

  const need = () => {
    if (!token) throw new Error("Not authenticated");
    return token;
  };

  const createTeam = async (name: string): Promise<Team> => {
    const team = await createTeamFn({ data: { token: need(), name } });
    setSnapshot((s) => ({
      ...s,
      teams: [...s.teams, team].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return team;
  };

  const renameTeam = async (teamId: string, name: string) => {
    await renameTeamFn({ data: { token: need(), teamId, name } });
    await refresh();
  };

  const deleteTeam = async (teamId: string) => {
    await deleteTeamFn({ data: { token: need(), teamId } });
    await Promise.all([refresh(), onRosterChange()]);
  };

  /** A new label takes the next colour round the palette unless one is given. */
  const createLabel = async (name: string, tone?: LabelTone): Promise<Label> => {
    const next = tone ?? LABEL_TONES[snapshot.labels.length % LABEL_TONES.length];
    const label = await createLabelFn({ data: { token: need(), name, tone: next } });
    setSnapshot((s) => ({
      ...s,
      labels: [...s.labels, label].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return label;
  };

  const updateLabel = async (labelId: string, name: string, tone: LabelTone) => {
    await updateLabelFn({ data: { token: need(), labelId, name, tone } });
    await refresh();
  };

  const deleteLabel = async (labelId: string) => {
    await deleteLabelFn({ data: { token: need(), labelId } });
    await refresh();
  };

  const setTeam = async (helperIds: string[], teamId: string | null) => {
    await setHelpersTeamFn({ data: { token: need(), helperIds, teamId } });
    await onRosterChange();
  };

  /** Shows the change at once; reloads the truth if it didn't save. */
  const setLabel = async (helperIds: string[], labelId: string, on: boolean) => {
    const ids = new Set(helperIds);
    setSnapshot((s) => ({
      ...s,
      assignments: on
        ? [
            ...s.assignments.filter((a) => !(a.labelId === labelId && ids.has(a.helperId))),
            ...helperIds.map((helperId) => ({ helperId, labelId })),
          ]
        : s.assignments.filter((a) => !(a.labelId === labelId && ids.has(a.helperId))),
    }));
    try {
      await setLabelOnHelpersFn({ data: { token: need(), labelId, helperIds, on } });
    } catch (err) {
      refresh().catch(() => {});
      throw err;
    }
  };

  return {
    /** False until add-teams-and-labels.sql is applied; hide teams then. */
    available: snapshot.available,
    teams: snapshot.teams,
    labels: snapshot.labels,
    teamById,
    labelById,
    labelIdsByHelper,
    labelsOf: (helperId: string): Label[] =>
      (labelIdsByHelper.get(helperId) ?? []).flatMap((id) => labelById.get(id) ?? []),
    refresh,
    createTeam,
    renameTeam,
    deleteTeam,
    createLabel,
    updateLabel,
    deleteLabel,
    setTeam,
    setLabel,
  };
}
