import { useContext } from "react";

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
export function useTeamView(): { teams: TeamView; activeCount: number } {
  const stores = useContext(AppStoreContext);
  return { teams: stores?.teams ?? NONE, activeCount: stores?.activeHelpers.length ?? 0 };
}
