import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createPlaceFn,
  deletePlaceFn,
  listSharingFn,
  setCoverFn,
  setHelperHouseholdFn,
  setSharedTeamFn,
  type SharingSnapshot,
} from "../sharing.actions";
import type { PlaceRef, SavedPlace } from "../sharing.types";

export type SharingStore = ReturnType<typeof useSharing>;

const EMPTY: SharingSnapshot = {
  available: false,
  sharedHelpers: [],
  elsewhere: [],
  covers: [],
  family: [],
  runs: [],
  places: [],
};

/**
 * Shared staff and places for the household the manager is in: who from
 * elsewhere in the family also works here, where this household's own staff
 * also work, which teams people cover, the family's houses and this
 * household's saved places.
 */
export function useSharing({
  token,
  ready,
  householdId,
}: {
  token: string | null;
  ready: boolean;
  householdId: string | null;
}) {
  const [snapshot, setSnapshot] = useState<SharingSnapshot>(EMPTY);

  const refresh = useCallback(async () => {
    if (!token) return;
    setSnapshot(await listSharingFn({ data: { token } }));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => console.error("[useSharing] Failed to load shared staff:", err));
    // A household switch reloads the page; householdId is here for safety.
  }, [ready, token, refresh, householdId]);

  const coversByHelper = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const c of snapshot.covers)
      map.set(c.helperId, [...(map.get(c.helperId) ?? []), c.teamId]);
    return map;
  }, [snapshot.covers]);

  const houseName = useMemo(
    () => new Map(snapshot.family.map((h) => [h.id, h.name] as const)),
    [snapshot.family],
  );
  const placeById = useMemo(
    () => new Map(snapshot.places.map((p) => [p.id, p] as const)),
    [snapshot.places],
  );

  const need = () => {
    if (!token) throw new Error("Not authenticated");
    return token;
  };

  return {
    ...snapshot,
    coversByHelper,
    refresh,
    /** "Beach House", "School", or null when it can't be named. */
    placeName: (ref: PlaceRef | undefined): string | null =>
      !ref
        ? null
        : ref.kind === "house"
          ? (houseName.get(ref.id) ?? null)
          : (placeById.get(ref.id)?.name ?? null),
    /** The other households of the family this manager runs, where staff can be shared. */
    shareTargets: snapshot.family.filter(
      (h) => h.id !== householdId && snapshot.runs.includes(h.id),
    ),
    householdsOf: (helperId: string) =>
      snapshot.elsewhere.filter((e) => e.helperId === helperId).map((e) => e.householdId),
    setHousehold: async (helperId: string, targetId: string, on: boolean) => {
      await setHelperHouseholdFn({ data: { token: need(), helperId, householdId: targetId, on } });
      await refresh();
    },
    setSharedTeam: async (helperId: string, teamId: string | null) => {
      if (!householdId) return;
      await setSharedTeamFn({ data: { token: need(), helperId, householdId, teamId } });
      await refresh();
    },
    setCover: async (helperId: string, teamId: string, on: boolean) => {
      await setCoverFn({ data: { token: need(), helperId, teamId, on } });
      await refresh();
    },
    createPlace: async (name: string): Promise<SavedPlace> => {
      if (!householdId) throw new Error("No household");
      const place = await createPlaceFn({ data: { token: need(), householdId, name } });
      await refresh();
      return place;
    },
    deletePlace: async (placeId: string) => {
      await deletePlaceFn({ data: { token: need(), placeId } });
      await refresh();
    },
  };
}
