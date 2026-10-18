import { useCallback, useEffect, useState } from "react";

import { DEFAULT_STATIONS, type Station } from "../people.types";
import {
  createStationFn,
  deleteStationFn,
  listStationsFn,
  renameStationFn,
  setHelperStationFn,
  type StationsSnapshot,
} from "../stations.actions";

export type StationStore = ReturnType<typeof useStations>;

const EMPTY: StationsSnapshot = {
  available: false,
  stations: DEFAULT_STATIONS.map((name) => ({ id: name, name, inUse: 0 })),
};

/**
 * The household's stations (add-household-stations.sql). A helper's station
 * is on her helper_profiles row, so a rename or a move refreshes the roster
 * through `onRosterChange` as well as this store.
 */
export function useStations({
  token,
  ready,
  onRosterChange,
}: {
  token: string | null;
  ready: boolean;
  onRosterChange: () => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<StationsSnapshot>(EMPTY);

  const refresh = useCallback(async () => {
    if (!token) return;
    setSnapshot(await listStationsFn({ data: { token } }));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => console.error("[useStations] Failed to load stations:", err));
  }, [ready, token, refresh]);

  const need = () => {
    if (!token) throw new Error("Not authenticated");
    return token;
  };

  const create = async (name: string) => {
    await createStationFn({ data: { token: need(), name } });
    await refresh();
  };

  const rename = async (stationId: string, name: string) => {
    await renameStationFn({ data: { token: need(), stationId, name } });
    await Promise.all([refresh(), onRosterChange()]);
  };

  const remove = async (stationId: string) => {
    await deleteStationFn({ data: { token: need(), stationId } });
    await refresh();
  };

  const setHelperStation = async (helperId: string, station: Station) => {
    await setHelperStationFn({ data: { token: need(), helperId, station } });
    await Promise.all([refresh(), onRosterChange()]);
  };

  return {
    /** False until add-household-stations.sql is applied: the five, and no editing. */
    available: snapshot.available,
    stations: snapshot.stations,
    /** Names in list order, for pickers. */
    names: snapshot.stations.map((s) => s.name),
    refresh,
    create,
    rename,
    remove,
    setHelperStation,
  };
}
