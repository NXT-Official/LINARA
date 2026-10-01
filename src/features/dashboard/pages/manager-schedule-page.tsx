import { Moon } from "lucide-react";
import { useState } from "react";

import { AppointmentsSection } from "@/features/appointments/components/appointments-section";
import { AvailabilityGate } from "@/features/availability/components/availability-gate";
import { useSendGate } from "@/features/availability/hooks/use-send-gate";
import { ShiftsSection } from "@/features/shifts/components/shifts-section";
import { EditTaskModal } from "@/features/tasks/components/edit-task-modal";
import { NewTaskModal } from "@/features/tasks/components/new-task-modal";
import { RoutinesView } from "@/features/tasks/components/routines-view";
import { TaskCard } from "@/features/tasks/components/task-card";
import { TaskPlanner } from "@/features/tasks/components/task-planner";
import type { Task } from "@/features/tasks/task.types";
import { QuickUtosLauncher } from "@/features/utos/components/quick-utos-launcher";

import { useAppStores } from "../app-store-context";

/** Planning ahead: the week or month of tasks, then shifts, routines, appointments and the queue. */
export function ManagerSchedulePage() {
  const {
    session,
    board,
    schedules,
    invites,
    appointments,
    helpers,
    activeHelpers,
    utos,
    utosRecipientId,
    setUtosRecipientId,
    clock,
  } = useAppStores();
  const activeInvites = invites.invites.filter((i) => i.status === "active");
  const { adminType, currentAdmin } = session;
  const { tasks, routines, simDate, addTask, addRoutine, removeRoutine, editTask } = board;
  const [addingOn, setAddingOn] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);

  const isRemote = adminType === "remote";
  const canEditShifts = adminType === "primary" || adminType === "co";
  const canOverride = adminType === "primary" || adminType === "co";
  const authorName = currentAdmin?.name ?? "Manager";
  const queued = tasks.filter((t) => t.queued);

  const gate = useSendGate({
    authorName,
    isRemote,
    schedules,
    nowTs: clock.nowTs,
    helperProfiles: invites.helperProfiles,
    resolveHelperName: (id) => helpers.find((h) => h.id === id)?.name ?? "your helper",
    utosTargetHelperId: utosRecipientId,
    activeHelpers,
    onSendUtos: utos.send,
    onAddTask: addTask,
  });

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Schedule</h1>
      {isRemote && (
        <div className="rounded-3xl border border-dashed border-border/70 bg-card/60 p-4 text-xs text-muted-foreground">
          <div className="mb-0.5 text-xs font-semibold text-pine-deep">Remote view</div>
          Shift editing and reaching a helper off-hours stay with the on-site managers. You can
          still look at the week and add appointments.
        </div>
      )}
      <TaskPlanner
        token={session.token}
        nowTs={clock.nowTs}
        boardTasks={tasks}
        helpers={helpers}
        activeHelpers={activeHelpers}
        appointments={appointments.appointments}
        scheduleFor={schedules.scheduleFor}
        onAddOn={setAddingOn}
        onOpenTask={isRemote ? undefined : setEditing}
        onMove={
          isRemote
            ? undefined
            : (task, scheduledStartIso) =>
                editTask(task.id, {
                  title: task.title,
                  note: task.note,
                  scheduledStartIso,
                  helperId: task.helperId,
                })
        }
      />
      <ShiftsSection schedules={schedules} helpers={activeInvites} readOnly={!canEditShifts} />
      <QuickUtosLauncher
        onSend={gate.sendUtos}
        helperName={activeHelpers.find((h) => h.id === utosRecipientId)?.name ?? "your helper"}
        activeHelpers={activeHelpers}
        selectedHelperId={utosRecipientId}
        onSelectHelper={setUtosRecipientId}
      />
      <RoutinesView
        routines={routines}
        token={session.token}
        activeHelpers={activeHelpers}
        onAdd={addRoutine}
        onRemove={removeRoutine}
      />
      <AppointmentsSection
        appointments={appointments}
        tasks={tasks}
        simDate={simDate}
        helpers={helpers}
        activeHelpers={activeHelpers}
      />
      {queued.length > 0 && (
        <section className="rounded-3xl ring-1 ring-border/20 bg-card/60 p-4 sm:p-5">
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
              <TaskCard key={t.id} task={t} helpers={helpers} />
            ))}
          </div>
        </section>
      )}

      {addingOn && (
        <NewTaskModal
          activeHelpers={activeHelpers}
          isRemote={isRemote}
          defaultDate={addingOn}
          scheduleFor={schedules.scheduleFor}
          onClose={() => setAddingOn(null)}
          onAdd={(t, opts) => {
            gate.addTask(t, opts);
            setAddingOn(null);
          }}
        />
      )}
      {editing && (
        <EditTaskModal
          task={editing}
          helpers={activeHelpers}
          scheduleFor={schedules.scheduleFor}
          token={session.token}
          myUserId={session.userId}
          onClose={() => setEditing(null)}
          onSave={(edit) => {
            void editTask(editing.id, edit);
            setEditing(null);
          }}
        />
      )}
      {gate.intent && (
        <AvailabilityGate
          intent={gate.intent}
          status={gate.intent.status}
          helperName={gate.intent.helperName}
          canOverride={canOverride}
          onCancel={gate.cancel}
          onChoose={gate.resolve}
        />
      )}
    </div>
  );
}
