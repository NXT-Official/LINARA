import { createContext, useContext } from "react";

import type { AppointmentStore } from "@/features/appointments/hooks/use-appointments";
import type { Availability } from "@/features/availability/hooks/use-availability";
import type { LedgerStore } from "@/features/ledger/hooks/use-ledger";
import type { ValeStore } from "@/features/ledger/hooks/use-vales";
import type { PantryStore } from "@/features/pantry/hooks/use-pantry";
import type { PayPeriodStore } from "@/features/pay/hooks/use-pay-periods";
import type { PayslipStore } from "@/features/pay/hooks/use-payslips";
import type { InviteStore } from "@/features/people/hooks/use-invites";
import type { StationStore } from "@/features/people/hooks/use-stations";
import type { Session } from "@/features/people/hooks/use-session";
import type { Helper } from "@/features/people/people.types";
import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";
import type { TimeOffStore } from "@/features/shifts/hooks/use-time-off";
import type { TaskBoard } from "@/features/tasks/hooks/use-task-board";
import type { TeamStore } from "@/features/teams/hooks/use-teams";
import type { SharingStore } from "@/features/sharing/hooks/use-sharing";
import type { HelperProfileRow } from "@/features/people/hooks/use-invites";
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
  /** ACTIVE helpers working here -- this household's and staff shared in from
   * elsewhere in the family -- for assignment dropdowns, lanes and the schedule. */
  activeHelpers: Helper[];
  /** ACTIVE helpers this household employs: everything about pay and leave. */
  employedHelpers: Helper[];
  /** helper_profiles rows for everyone working here; shared staff's carry no pay. */
  staffProfiles: HelperProfileRow[];
  session: Session;
  invites: InviteStore;
  /** Teams and labels, for grouping and filtering staff (add-teams-and-labels.sql). */
  teams: TeamStore;
  /** The household's stations, editable by its managers (add-household-stations.sql). */
  stations: StationStore;
  /** Shared staff, covered teams and places (add-shared-staff-and-places.sql). */
  sharing: SharingStore;
  pantry: PantryStore;
  schedules: ScheduleStore;
  /** Every helper's approved and pending time off (rest off today; leave later). */
  timeOff: TimeOffStore;
  vales: ValeStore;
  payslips: PayslipStore;
  /** Every claimed helper's pay periods and which are unpaid (add-pay-periods.sql). */
  payPeriods: PayPeriodStore;
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
};

export const AppStoreContext = createContext<AppStores | undefined>(undefined);

export function useAppStores(): AppStores {
  const stores = useContext(AppStoreContext);
  if (!stores) throw new Error("useAppStores must be used within AppStoreProvider");
  return stores;
}
