import { useState } from "react";

import { AppointmentsSection } from "@/features/appointments/components/appointments-section";
import { AvailabilityGate } from "@/features/availability/components/availability-gate";
import { useSendGate } from "@/features/availability/hooks/use-send-gate";
import { ShiftsSection } from "@/features/shifts/components/shifts-section";
import { EditTaskModal } from "@/features/tasks/components/edit-task-modal";
import { NewTaskModal } from "@/features/tasks/components/new-task-modal";
import { RoutinesView } from "@/features/tasks/components/routines-view";
import { TaskPlanner } from "@/features/tasks/components/task-planner";
import type { Task } from "@/features/tasks/task.types";

import { useAppStores } from "../app-store-context";

export const SCHEDULE_TABS = [
  { key: "plan", label: "Plan" },
  { key: "appointments", label: "Appointments" },
  { key: "shifts", label: "Shifts" },
  { key: "routines", label: "Routines" },
] as const;
export type ScheduleTab = (typeof SCHEDULE_TABS)[number]["key"];

/**
 * Planning ahead. The planner is the page: tasks, appointments, days off and
 * routines all show on it. What sets the calendar up (appointments, shift
 * hours, routines) sits one tab over, so it doesn't stack under the plan.
 */
export function ManagerSchedulePage({
  tab,
  day,
  onTabChange,
}: {
  tab: ScheduleTab;
  /** YYYY-MM-DD the planner opens on. */
  day?: string;
  onTabChange: (tab: ScheduleTab) => void;
}) {
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
    clock,
  } = useAppStores();
  const activeInvites = invites.invites.filter((i) => i.status === "active");
  const { adminType, currentAdmin } = session;
  const { tasks, routines, simDate, addTask, addRoutine, removeRoutine, editTask } = board;
  const [addingOn, setAddingOn] = useState<{ day: string; helperId?: string | null } | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);

  const isRemote = adminType === "remote";
  const canEditShifts = adminType === "primary" || adminType === "co";
  const canOverride = adminType === "primary" || adminType === "co";
  const authorName = currentAdmin?.name ?? "Manager";

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

      <div className="-mx-1 overflow-x-auto px-1">
        <div
          className="inline-flex rounded-xl border border-border bg-card p-1 shadow-soft"
          role="group"
          aria-label="Schedule section"
        >
          {SCHEDULE_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => onTabChange(key)}
              aria-pressed={tab === key}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                tab === key
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === "plan" && (
        <TaskPlanner
          token={session.token}
          nowTs={clock.nowTs}
          boardTasks={tasks}
          routines={routines}
          helpers={helpers}
          activeHelpers={activeHelpers}
          appointments={appointments.appointments}
          scheduleFor={schedules.scheduleFor}
          initialDay={day}
          onAddOn={(dayIso, helperId) => setAddingOn({ day: dayIso, helperId })}
          onOpenTask={isRemote ? undefined : setEditing}
          onOpenAppointment={() => onTabChange("appointments")}
          onMove={
            isRemote
              ? undefined
              : (task, scheduledStartIso, helperId) =>
                  editTask(task.id, {
                    title: task.title,
                    note: task.note,
                    scheduledStartIso,
                    helperId,
                  })
          }
        />
      )}
      {tab === "appointments" && (
        <AppointmentsSection
          appointments={appointments}
          tasks={tasks}
          simDate={simDate}
          helpers={helpers}
          activeHelpers={activeHelpers}
        />
      )}
      {tab === "shifts" && (
        <ShiftsSection schedules={schedules} helpers={activeInvites} readOnly={!canEditShifts} />
      )}
      {tab === "routines" && (
        <RoutinesView
          routines={routines}
          token={session.token}
          activeHelpers={activeHelpers}
          onAdd={addRoutine}
          onRemove={removeRoutine}
        />
      )}

      {addingOn && (
        <NewTaskModal
          activeHelpers={activeHelpers}
          isRemote={isRemote}
          defaultDate={addingOn.day}
          defaultHelperId={addingOn.helperId === undefined ? undefined : (addingOn.helperId ?? "")}
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
