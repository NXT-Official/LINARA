import { useState } from "react";

import { AvailabilityGate } from "@/features/availability/components/availability-gate";
import { useSendGate } from "@/features/availability/hooks/use-send-gate";
import { EditTaskModal } from "@/features/tasks/components/edit-task-modal";
import { NewTaskModal } from "@/features/tasks/components/new-task-modal";
import type { Task } from "@/features/tasks/task.types";
import { isLaterThanToday, isPastDue } from "@/features/tasks/task.utils";
import { toISODate } from "@/lib/time";

import { useAppStores } from "../app-store-context";
import { ManagerPassTab, type PassMode } from "../components/manager-pass-tab";
import { StartNewDayModal } from "../components/start-new-day-modal";

/** Today at a glance: what needs a decision, then the day itself. */
export function ManagerPassPage({
  view,
  onViewChange,
}: {
  view: PassMode | undefined;
  onViewChange: (mode: PassMode) => void;
}) {
  const {
    session,
    board,
    schedules,
    vales,
    payslips,
    payPeriods,
    invites: inviteStore,
    availability,
    helper,
    helpers,
    activeHelpers,
    utos,
    utosRecipientId,
    clock,
    startNewDay,
    previewNewDay,
  } = useAppStores();
  const { adminType, currentAdmin } = session;

  // Pay still owed, per helper (current or past): closed periods with no
  // payment, plus the final cutoff of someone who has left. From the shared
  // pay-periods list (add-pay-periods.sql), so it matches Money and Past staff.
  const owedPay = inviteStore.invites
    .filter((i) => i.status !== "pending")
    .map((invite) => {
      const periods = payPeriods.byHelper[invite.id] ?? [];
      const finalDue = invite.status === "ended" && periods.some((p) => p.isFinal && !p.payslipId);
      return { invite, count: payPeriods.missed(invite.id).length + (finalDue ? 1 : 0) };
    })
    .filter((o) => o.count > 0);
  const disputedPayments = payslips.payslips
    .filter((p) => p.payoutProvider === "manual" && p.helperAck === "disputed")
    .map((payslip) => {
      const invite = inviteStore.invites.find((i) => i.id === payslip.helperId);
      return {
        payslip,
        name: invite ? invite.claimedName || invite.name : "Your helper",
        left: invite?.status === "ended",
      };
    });
  const {
    tasks,
    boardClosed,
    simDate,
    addTask,
    rescheduleTask,
    editTask,
    cancelTask,
    approveSuggestion,
    dismissSuggestion,
  } = board;

  const isRemote = adminType === "remote";
  const canOverride = adminType === "primary" || adminType === "co";
  const canStartNewDay = adminType === "primary" || adminType === "co";
  const authorName = currentAdmin?.name ?? "Manager";
  const rosaStatus = availability.status;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [confirmingNewDay, setConfirmingNewDay] = useState(false);
  const [newDayPreview, setNewDayPreview] = useState<{
    pendingUtos: number;
    routinesRespawning: number;
  } | null>(null);
  const [startingNewDay, setStartingNewDay] = useState(false);

  const openNewDayConfirm = () => {
    setConfirmingNewDay(true);
    setNewDayPreview(null);
    previewNewDay()
      .then(setNewDayPreview)
      .catch((err) => {
        console.error("[ManagerPassPage] Failed to load new-day preview:", err);
        setNewDayPreview({ pendingUtos: 0, routinesRespawning: 0 });
      });
  };

  const confirmNewDay = async () => {
    setStartingNewDay(true);
    try {
      await startNewDay();
    } finally {
      setStartingNewDay(false);
      setConfirmingNewDay(false);
    }
  };

  // The Pass is day-by-day: anything scheduled for a later day sits in
  // "Coming up" and counts toward none of today's numbers.
  const onBoard = tasks.filter((t) => !t.queued && !t.suggested);
  const active = onBoard.filter((t) => !isLaterThanToday(t, clock.nowTs));
  const upcoming = onBoard.filter((t) => isLaterThanToday(t, clock.nowTs));
  const pastDue = active.filter((t) => isPastDue(t, clock.nowTs));
  const gate = useSendGate({
    authorName,
    isRemote,
    schedules,
    nowTs: clock.nowTs,
    helperProfiles: inviteStore.helperProfiles,
    resolveHelperName: (id) => helpers.find((h) => h.id === id)?.name ?? "your helper",
    utosTargetHelperId: utosRecipientId,
    activeHelpers,
    onSendUtos: utos.send,
    onAddTask: addTask,
  });

  return (
    <>
      <h1 className="sr-only">The Pass</h1>
      <ManagerPassTab
        active={active}
        upcoming={upcoming}
        suggestions={tasks.filter((t) => t.suggested)}
        blocked={onBoard.filter((t) => t.status === "blocked")}
        pastDue={pastDue}
        nowTs={clock.nowTs}
        pendingVales={vales.vales.filter((v) => v.status === "pending")}
        flaggedInvites={inviteStore.invites.filter(
          (i) => i.status !== "ended" && i.flags.length > 0,
        )}
        owedPay={owedPay}
        disputedPayments={disputedPayments}
        notices={inviteStore.invites.filter((i) => i.status === "active" && i.noticeLastDay)}
        helpers={helpers}
        activeHelpers={activeHelpers}
        simDate={simDate}
        boardClosed={boardClosed}
        rosaStatus={rosaStatus}
        helperName={helper?.name ?? "your helper"}
        authorName={authorName}
        isRemote={isRemote}
        canStartNewDay={canStartNewDay}
        onStartNewDay={openNewDayConfirm}
        onReschedule={rescheduleTask}
        onEditTask={setEditing}
        onCancelTask={cancelTask}
        onDecideVale={vales.decide}
        onResolveFlag={inviteStore.resolveFlag}
        onApproveSuggestion={approveSuggestion}
        onDismissSuggestion={dismissSuggestion}
        onNewTask={() => setOpen(true)}
        view={view}
        onViewChange={onViewChange}
      />

      {open && (
        <NewTaskModal
          activeHelpers={activeHelpers}
          isRemote={isRemote}
          defaultDate={toISODate(simDate)}
          scheduleFor={schedules.scheduleFor}
          onClose={() => setOpen(false)}
          onAdd={(t, opts) => {
            gate.addTask(t, opts);
            setOpen(false);
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
      {confirmingNewDay && (
        <StartNewDayModal
          preview={newDayPreview}
          loading={startingNewDay}
          onConfirm={confirmNewDay}
          onCancel={() => setConfirmingNewDay(false)}
        />
      )}
    </>
  );
}
