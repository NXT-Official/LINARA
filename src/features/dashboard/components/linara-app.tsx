import { GroceryProvider } from "@/features/groceries/components/grocery-provider";
import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import { useAvailability } from "@/features/availability/hooks/use-availability";
import { useLedger } from "@/features/ledger/hooks/use-ledger";
import { useVales } from "@/features/ledger/hooks/use-vales";
import { usePantry } from "@/features/pantry/hooks/use-pantry";
import { helperById } from "@/features/people/people.utils";
import { useInvites } from "@/features/people/hooks/use-invites";
import { useSession } from "@/features/people/hooks/use-session";
import { useSchedules } from "@/features/shifts/hooks/use-schedules";
import { useTaskBoard } from "@/features/tasks/hooks/use-task-board";
import { useUtos } from "@/features/utos/hooks/use-utos";

import { useSimClock } from "../hooks/use-sim-clock";
import { HelperView } from "./helper-view";
import { ManagerView } from "./manager-view";
import { TopBar } from "./top-bar";

/**
 * The composition root: every feature store is created here and handed to the one
 * view that needs it. Which view renders is the persona switcher's business — the
 * prototype has no auth, so `session.role` decides.
 */
export function LinaraApp() {
  // The only helper with a first-class device in this prototype.
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

  const startNewDay = () => {
    utos.clearForNewDay();
    board.startNewDay();
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar session={session} board={board} clock={clock} />
      <GroceryProvider pantry={pantry}>
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6 sm:pt-6">
          {session.role === "manager" ? (
            <ManagerView
              session={session}
              board={board}
              appointmentStore={appointments}
              ledgerStore={ledger}
              valeStore={vales}
              pantry={pantry}
              schedules={schedules}
              availability={availability}
              inviteStore={invites}
              sendUtos={utos.send}
              helper={helper}
              onStartNewDay={startNewDay}
            />
          ) : (
            <HelperView
              helper={helper}
              board={board}
              ledgerStore={ledger}
              valeStore={vales}
              pantry={pantry}
              schedules={schedules}
              availability={availability}
              inviteStore={invites}
              utos={utos}
            />
          )}
        </main>
      </GroceryProvider>
    </div>
  );
}
