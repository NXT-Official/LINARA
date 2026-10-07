import { useContext, useMemo } from "react";

import { AppStoreContext } from "@/features/dashboard/app-store-context";

import type { TeamStore } from "./use-teams";

/** What the views read from the team store. */
export type TeamView = Pick<
  TeamStore,
  "available" | "teams" | "labels" | "teamById" | "labelById" | "labelIdsByHelper" | "labelsOf"
>;

const NONE: TeamView = {
  available: false,
  teams: [],
  labels: [],
  teamById: new Map(),
  labelById: new Map(),
  labelIdsByHelper: new Map(),
  labelsOf: () => [],
};

/**
 * Teams and labels when the app's stores are there; none otherwise (a
 * component rendered on its own, as in a unit test), which reads as a small
 * household with no teams.
 */
export function useTeamView(): {
  teams: TeamView;
  activeCount: number;
  /** Teams each helper also covers, besides her own (add-shared-staff-and-places.sql). */
  coversByHelper: Map<string, string[]>;
  /** Teams and labels at least one current helper is in. Empty ones filter to nobody. */
  inUse: { teamIds: Set<string>; labelIds: Set<string> };
} {
  const stores = useContext(AppStoreContext);
  const teams = stores?.teams ?? NONE;
  const activeHelpers = stores?.activeHelpers;
  const coversByHelper = stores?.sharing.coversByHelper ?? NO_COVERS;
  const inUse = useMemo(() => {
    const teamIds = new Set<string>();
    const labelIds = new Set<string>();
    for (const h of activeHelpers ?? []) {
      if (h.teamId) teamIds.add(h.teamId);
      for (const id of coversByHelper.get(h.id) ?? []) teamIds.add(id);
      for (const id of teams.labelIdsByHelper.get(h.id) ?? []) labelIds.add(id);
    }
    return { teamIds, labelIds };
  }, [activeHelpers, coversByHelper, teams.labelIdsByHelper]);
  return {
    teams,
    activeCount: activeHelpers?.length ?? 0,
    coversByHelper,
    inUse,
  };
}

const NO_COVERS = new Map<string, string[]>();
