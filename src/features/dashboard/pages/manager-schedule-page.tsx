import { Moon } from "lucide-react";

import { AppointmentsSection } from "@/features/appointments/components/appointments-section";
import { AvailabilityGate } from "@/features/availability/components/availability-gate";
import { useSendGate } from "@/features/availability/hooks/use-send-gate";
import { ShiftsSection } from "@/features/shifts/components/shifts-section";
import { RoutinesView } from "@/features/tasks/components/routines-view";
import { TaskCard } from "@/features/tasks/components/task-card";
import { QuickUtosLauncher } from "@/features/utos/components/quick-utos-launcher";

import { useAppStores } from "../app-store-context";

/** The week: shifts, routines, appointments, and what is queued for tomorrow. */
export function ManagerSchedulePage() {
  const { session, board, schedules, appointments, availability, helper, utos } = useAppStores();
  const { adminType, currentAdmin } = session;
  const { tasks, routines, simDate, addTask, addRoutine, removeRoutine } = board;

  const isRemote = adminType === "remote";
  const canEditShifts = adminType === "primary" || adminType === "co";
  const canOverride = adminType === "primary" || adminType === "co";
  const authorName = currentAdmin?.name ?? "Manager";
  const rosaStatus = availability.status;
  const queued = tasks.filter((t) => t.queued);

  const gate = useSendGate({
    status: rosaStatus,
    authorName,
    isRemote,
    onSendUtos: utos.send,
    onAddTask: addTask,
  });

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Schedule</h1>
      {isRemote && (
        <div className="rounded-3xl border border-dashed border-border/70 bg-card/60 p-4 text-xs text-muted-foreground">
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-pine-deep">
            Remote view
          </div>
          Shift editing and reaching a helper off-hours stay with the on-site managers. You can
          still look at the week and add appointments.
        </div>
      )}
      <ShiftsSection schedules={schedules} readOnly={!canEditShifts} />
      <QuickUtosLauncher onSend={gate.sendUtos} helperName={helper.name} />
      <RoutinesView routines={routines} onAdd={addRoutine} onRemove={removeRoutine} />
      <AppointmentsSection appointments={appointments} tasks={tasks} simDate={simDate} />
      {queued.length > 0 && (
        <section className="rounded-3xl border border-border/70 bg-card/60 p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep">
                <Moon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  Queued for tomorrow · {queued.length}
                </div>
                <div className="text-xs text-muted-foreground">
                  These will move to To-do when you reopen the board.
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {queued.map((t) => (
              <TaskCard key={t.id} task={t} />
            ))}
          </div>
        </section>
      )}

      {gate.intent && (
        <AvailabilityGate
          intent={gate.intent}
          status={rosaStatus}
          helperName={helper.name}
          canOverride={canOverride}
          onCancel={gate.cancel}
          onChoose={gate.resolve}
        />
      )}
    </div>
  );
}
