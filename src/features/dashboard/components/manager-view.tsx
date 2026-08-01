import { Calendar, ClipboardList, Moon, Package, Users, Wallet } from "lucide-react";
import { useState } from "react";

import { BottomNav } from "@/components/shared/bottom-nav";
import { AppointmentsSection } from "@/features/appointments/components/appointments-section";
import type { AppointmentStore } from "@/features/appointments/hooks/use-appointments";
import { AvailabilityGate } from "@/features/availability/components/availability-gate";
import type { Availability } from "@/features/availability/hooks/use-availability";
import { useSendGate } from "@/features/availability/hooks/use-send-gate";
import { GrocerySection } from "@/features/groceries/components/grocery-section";
import { AfterHoursLedger } from "@/features/ledger/components/after-hours-ledger";
import type { LedgerStore } from "@/features/ledger/hooks/use-ledger";
import type { ValeStore } from "@/features/ledger/hooks/use-vales";
import { PantrySection } from "@/features/pantry/components/pantry-section";
import type { PantryStore } from "@/features/pantry/hooks/use-pantry";
import { PeopleSection } from "@/features/people/components/people-section";
import type { Helper } from "@/features/people/people.types";
import type { InviteStore } from "@/features/people/hooks/use-invites";
import type { Session } from "@/features/people/hooks/use-session";
import { ShiftsSection } from "@/features/shifts/components/shifts-section";
import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";
import { NewTaskModal } from "@/features/tasks/components/new-task-modal";
import { RoutinesView } from "@/features/tasks/components/routines-view";
import { TaskCard } from "@/features/tasks/components/task-card";
import type { TaskBoard } from "@/features/tasks/hooks/use-task-board";
import { QuickUtosLauncher } from "@/features/utos/components/quick-utos-launcher";
import type { SendFlags } from "@/features/utos/hooks/use-utos";

import { ManagerPassTab } from "./manager-pass-tab";
import { SpendAndPayday } from "./spend-and-payday";

// ---------- Manager view ----------
export function ManagerView({
  session,
  board,
  appointmentStore,
  ledgerStore,
  valeStore,
  pantry,
  schedules,
  availability,
  inviteStore,
  sendUtos,
  helper,
  onStartNewDay,
}: {
  session: Session;
  board: TaskBoard;
  appointmentStore: AppointmentStore;
  ledgerStore: LedgerStore;
  valeStore: ValeStore;
  pantry: PantryStore;
  schedules: ScheduleStore;
  availability: Availability;
  inviteStore: InviteStore;
  sendUtos: (content: string, flags?: SendFlags) => void;
  helper: Helper;
  onStartNewDay: () => void;
}) {
  const { admins, adminType, currentAdmin, updateAdminType: onUpdateAdminType } = session;
  const {
    tasks,
    routines,
    boardClosed,
    simDate,
    addTask: onAdd,
    rescheduleTask: onReschedule,
    approveSuggestion: onApproveSuggestion,
    dismissSuggestion: onDismissSuggestion,
    addRoutine: onAddRoutine,
    removeRoutine: onRemoveRoutine,
  } = board;
  const { vales, decide: onDecideVale } = valeStore;
  const {
    entries: ledger,
    resolutionDefault: ledgerDefault,
    setResolutionDefault: onSetLedgerDefault,
    updateEntry: onUpdateLedgerEntry,
  } = ledgerStore;
  const {
    invites,
    create: createInvite,
    cancel: onRemoveInvite,
    resolveFlag: onResolveFlag,
  } = inviteStore;
  const rosaStatus = availability.status;
  const helperName = helper.name;
  const onSendUtos = sendUtos;

  const canEditShifts = adminType === "primary" || adminType === "co";
  const canEditAdmins = adminType === "primary";
  const canStartNewDay = adminType === "primary" || adminType === "co";
  const canOverride = adminType === "primary" || adminType === "co";
  const isRemote = adminType === "remote";
  const authorName = currentAdmin?.name ?? "Manager";
  const [view, setView] = useState<"pass" | "schedule" | "pantry" | "money" | "people">("pass");
  const [open, setOpen] = useState(false);
  const canInvite = adminType === "primary" || adminType === "co";
  const active = tasks.filter((t) => !t.queued && !t.suggested);
  const queued = tasks.filter((t) => t.queued);
  const suggestions = tasks.filter((t) => t.suggested);
  const blocked = active.filter((t) => t.status === "blocked");
  const pendingVales = vales.filter((v) => v.status === "pending");
  const gate = useSendGate({
    status: rosaStatus,
    authorName,
    isRemote,
    onSendUtos,
    onAddTask: onAdd,
  });

  return (
    <div className="space-y-6 pb-24">
      {view === "pass" && (
        <ManagerPassTab
          active={active}
          suggestions={suggestions}
          blocked={blocked}
          pendingVales={pendingVales}
          flaggedInvites={invites.filter((i) => i.flags.length > 0)}
          simDate={simDate}
          boardClosed={boardClosed}
          rosaStatus={rosaStatus}
          helperName={helperName}
          authorName={authorName}
          isRemote={isRemote}
          canStartNewDay={canStartNewDay}
          onStartNewDay={onStartNewDay}
          onReschedule={onReschedule}
          onDecideVale={onDecideVale}
          onResolveFlag={onResolveFlag}
          onApproveSuggestion={onApproveSuggestion}
          onDismissSuggestion={onDismissSuggestion}
          onNewTask={() => setOpen(true)}
        />
      )}

      {view === "schedule" && (
        <div className="space-y-6">
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
          <QuickUtosLauncher onSend={gate.sendUtos} helperName={helperName} />
          <RoutinesView routines={routines} onAdd={onAddRoutine} onRemove={onRemoveRoutine} />
          <AppointmentsSection appointments={appointmentStore} tasks={tasks} simDate={simDate} />
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
        </div>
      )}

      {view === "pantry" && (
        <div className="space-y-6">
          <PantrySection pantry={pantry} />
          <GrocerySection />
        </div>
      )}

      {view === "money" && (
        <div className="space-y-6">
          <SpendAndPayday />
          <AfterHoursLedger
            entries={ledger}
            ledgerDefault={ledgerDefault}
            onSetDefault={onSetLedgerDefault}
            onUpdateEntry={onUpdateLedgerEntry}
            audience="manager"
            helperName={helperName}
          />
        </div>
      )}

      {view === "people" && (
        <PeopleSection
          admins={admins}
          currentAdmin={currentAdmin}
          canEditAdmins={canEditAdmins}
          onUpdateAdminType={onUpdateAdminType}
          schedules={schedules.byHelper}
          invites={invites}
          canInvite={canInvite}
          onInvite={(data) => createInvite(data, authorName)}
          onCancelInvite={onRemoveInvite}
        />
      )}

      {open && (
        <NewTaskModal
          isRemote={isRemote}
          onClose={() => setOpen(false)}
          onAdd={(t, opts) => {
            gate.addTask(t, opts);
            setOpen(false);
          }}
        />
      )}
      {gate.intent && (
        <AvailabilityGate
          intent={gate.intent}
          status={rosaStatus}
          helperName={helperName}
          canOverride={canOverride}
          onCancel={gate.cancel}
          onChoose={gate.resolve}
        />
      )}

      <BottomNav
        active={view}
        onChange={(k) => setView(k as typeof view)}
        items={[
          { key: "pass", label: "Pass", Icon: ClipboardList },
          { key: "schedule", label: "Schedule", Icon: Calendar },
          { key: "pantry", label: "Pantry", Icon: Package },
          { key: "money", label: "Money", Icon: Wallet },
          { key: "people", label: "People", Icon: Users },
        ]}
      />
    </div>
  );
}
