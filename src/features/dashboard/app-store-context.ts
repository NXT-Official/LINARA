import { createContext, useContext } from "react";

import type { AppointmentStore } from "@/features/appointments/hooks/use-appointments";
import type { Availability } from "@/features/availability/hooks/use-availability";
import type { LedgerStore } from "@/features/ledger/hooks/use-ledger";
import type { ValeStore } from "@/features/ledger/hooks/use-vales";
import type { PantryStore } from "@/features/pantry/hooks/use-pantry";
import type { PayslipStore } from "@/features/pay/hooks/use-payslips";
import type { InviteStore } from "@/features/people/hooks/use-invites";
import type { Session } from "@/features/people/hooks/use-session";
import type { Helper } from "@/features/people/people.types";
import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";
import type { TaskBoard } from "@/features/tasks/hooks/use-task-board";
import type { UtosStore } from "@/features/utos/hooks/use-utos";

import type { SimClock } from "./hooks/use-sim-clock";

/**
 * Every feature store, created once above the router `<Outlet />` so page state
 * survives navigation.
 *
 * ponytail: one context rather than eleven providers — the stores are wired to
 * each other (board → ledger → availability → clock/schedules), so they have to
 * be built in one place anyway. Split it the day a store becomes independent.
 */
export type AppStores = {
  /** The one helper with a first-class device in this prototype -- the first real
   * ACTIVE helper_profiles row, since there is no real per-helper auth session yet
   * (see KNOWN_GAPS.md). Null until at least one helper has claimed their account. */
  helper: Helper | null;
  /** Every helper_profiles row for the household, any status -- for id -> Helper lookups. */
  helpers: Helper[];
  /** ACTIVE helpers only -- for assignment dropdowns and per-helper lane rendering. */
  activeHelpers: Helper[];
  session: Session;
  invites: InviteStore;
  pantry: PantryStore;
  schedules: ScheduleStore;
  vales: ValeStore;
  payslips: PayslipStore;
  clock: SimClock;
  availability: Availability;
  ledger: LedgerStore;
  board: TaskBoard;
  appointments: AppointmentStore;
  utos: UtosStore;
  /** Who the next Quick Utos goes to -- see MULTI_HELPER_HANDLING.md. Defaults
   * to `helper.id` until a manager explicitly picks someone else. */
  utosRecipientId: string | null;
  setUtosRecipientId: (helperId: string | null) => void;
  isOnline: boolean;
  isOfflineSimulated: boolean;
  setOfflineSimulated: (b: boolean) => void;
  /** Clears every active helper's pending Quick Utos household-wide and rolls
   * the board to tomorrow -- see MULTI_HELPER_HANDLING.md / KNOWN_GAPS.md C30. */
  startNewDay: () => Promise<void>;
  /** Live counts for the "Start new day" confirmation modal, without
   * mutating anything -- see manager-pass-page.tsx's StartNewDayModal. */
  previewNewDay: () => Promise<{ pendingUtos: number; routinesRespawning: number }>;
};

export const AppStoreContext = createContext<AppStores | undefined>(undefined);

export function useAppStores(): AppStores {
  const stores = useContext(AppStoreContext);
  if (!stores) throw new Error("useAppStores must be used within AppStoreProvider");
  return stores;
}
