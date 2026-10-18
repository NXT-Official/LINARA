import { useContext } from "react";

import { AppStoreContext } from "@/features/dashboard/app-store-context";

import type { SharingStore } from "./use-sharing";

type Busy = Pick<SharingStore, "busyOn" | "busyOverlap">;

const NONE: Busy = { busyOn: () => [], busyOverlap: () => undefined };

/**
 * Her tasks at the family's other houses, when the app's stores are there;
 * none otherwise (a component rendered on its own, as in a unit test).
 */
export function useBusyElsewhere(): Busy {
  const stores = useContext(AppStoreContext);
  return stores?.sharing ?? NONE;
}
