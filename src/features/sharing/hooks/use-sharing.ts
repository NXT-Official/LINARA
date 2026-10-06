import { useCallback, useEffect, useMemo, useState } from "react";

import { toHouseholdClock, toISODate } from "@/lib/time";

import {
  createPlaceFn,
  deletePlaceFn,
  listBusyElsewhereFn,
  listSharingFn,
  setCoverFn,
  setHelperHouseholdFn,
  setSharedTeamFn,
  type BusyElsewhere,
  type SharingSnapshot,
} from "../sharing.actions";
import type { PlaceRef, SavedPlace } from "../sharing.types";

export type SharingStore = ReturnType<typeof useSharing>;

// Another house books her on its own schedule, so look again now and then.
const BUSY_POLL_MS = 2 * 60_000;
const BUSY_DAYS = 14;

/** A task elsewhere, on the household clock. */
export type BusySlot = BusyElsewhere & { dayIso: string; minute: number };

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

  // Her tasks at the family's other houses, from yesterday to two weeks out.
  const [busy, setBusy] = useState<BusySlot[]>([]);
  useEffect(() => {
    if (!ready || !token || !snapshot.available) return;
    let cancelled = false;
    const load = () => {
      const from = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const to = new Date(Date.now() + BUSY_DAYS * 24 * 60 * 60_000).toISOString();
      listBusyElsewhereFn({ data: { token, from, to } })
        .then((rows) => {
          if (cancelled) return;
          setBusy(
            rows.map((r) => {
              const d = toHouseholdClock(r.start);
              return { ...r, dayIso: toISODate(d), minute: d.getHours() * 60 + d.getMinutes() };
            }),
          );
        })
        .catch((err) => console.error("[useSharing] Failed to load busy elsewhere:", err));
    };
    load();
    const timer = window.setInterval(load, BUSY_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ready, token, snapshot.available]);

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
    /** Her tasks at another house on this day (times and house only), earliest first. */
    busyOn: (helperId: string, dayIso: string): BusySlot[] =>
      busy
        .filter((b) => b.helperId === helperId && b.dayIso === dayIso)
        .sort((a, b) => a.minute - b.minute),
    /** Her open task at another house within `withinMin` of this time, if any. */
    busyNear: (
      helperId: string,
      dayIso: string,
      minute: number,
      withinMin = 60,
    ): BusySlot | undefined =>
      busy.find(
        (b) =>
          b.helperId === helperId &&
          b.dayIso === dayIso &&
          b.status !== "done" &&
          Math.abs(b.minute - minute) < withinMin,
      ),
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
