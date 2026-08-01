import type { ReactNode } from "react";

import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import { useAvailability } from "@/features/availability/hooks/use-availability";
import { GroceryProvider } from "@/features/groceries/components/grocery-provider";
import { useLedger } from "@/features/ledger/hooks/use-ledger";
import { useVales } from "@/features/ledger/hooks/use-vales";
import { usePantry } from "@/features/pantry/hooks/use-pantry";
import { useInvites } from "@/features/people/hooks/use-invites";
import { useSession } from "@/features/people/hooks/use-session";
import { helperById } from "@/features/people/people.utils";
import { useSchedules } from "@/features/shifts/hooks/use-schedules";
import { useTaskBoard } from "@/features/tasks/hooks/use-task-board";
import { useUtos } from "@/features/utos/hooks/use-utos";

import { AppStoreContext, type AppStores } from "../app-store-context";
import { useSimClock } from "../hooks/use-sim-clock";

/**
 * The composition root: every feature store is created here and shared with the
 * routed pages below it. Lives on the `_app` layout route so a page change never
 * remounts the day's state.
 */
export function AppStoreProvider({ children }: { children: ReactNode }) {
  const currentHelperId = "rosa";
  const helper = helperById(currentHelperId);

  const session = useSession();
  const invites = useInvites();
  const pantry = usePantry();
  const schedules = useSchedules();
  const vales = useVales();
  const clock = useSimClock();
  const availability = useAvailability({ nowTs: clock.nowTs, schedules });
  const ledger = useLedger({ rosaStatus: availability.status, schedules });
  const board = useTaskBoard({ nowTs: clock.nowTs, onComplete: ledger.record });
  const appointments = useAppointments(board.setTasks);
  const utos = useUtos({
    toHelperId: currentHelperId,
    // A quick utos finished off-shift is worth a token five minutes.
    onDone: (u) =>
      ledger.record({
        sourceId: u.id,
        kind: "utos",
        title: u.content,
        helperId: currentHelperId,
        startTs: u.timestamp,
        doneTs: clock.nowTs,
        autoMinutes: 5,
        emergency: !!u.emergency,
      }),
  });

  const value: AppStores = {
    helper,
    session,
    invites,
    pantry,
    schedules,
    vales,
    clock,
    availability,
    ledger,
    board,
    appointments,
    utos,
    startNewDay: () => {
      utos.clearForNewDay();
      board.startNewDay();
    },
  };

  return (
    <AppStoreContext.Provider value={value}>
      <GroceryProvider pantry={pantry}>{children}</GroceryProvider>
    </AppStoreContext.Provider>
  );
}
