import { useState } from "react";

import { manualFromRow, statusFor } from "@/features/availability/availability.utils";
import { AvailabilityGate } from "@/features/availability/components/availability-gate";
import { useSendGate } from "@/features/availability/hooks/use-send-gate";
import { useOpenTaskCounts } from "@/features/leave/hooks/use-open-task-counts";
import { EditTaskModal } from "@/features/tasks/components/edit-task-modal";
import { NewTaskModal } from "@/features/tasks/components/new-task-modal";
import { usePlannerTasks } from "@/features/tasks/hooks/use-planner-tasks";
import { addDays } from "@/features/tasks/planner.utils";
import type { Task } from "@/features/tasks/task.types";
import { isLaterThanToday, isPastDue } from "@/features/tasks/task.utils";
import { QuickUtosLauncher } from "@/features/utos/components/quick-utos-launcher";
import { parseISODate, startOfDayIso, toISODate } from "@/lib/time";

import { useAppStores } from "../app-store-context";
import { EndDayModal } from "../components/end-day-modal";
import { ManagerPassTab, type PassMode } from "../components/manager-pass-tab";

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
    staffProfiles,
    utos,
    utosRecipientId,
    timeOff,
    setUtosRecipientId,
    clock,
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
    setClosed,
    simDate,
    addTask,
    rescheduleTask,
    editTask,
    cancelTask,
    stopRepeating,
    approveSuggestion,
    dismissSuggestion,
  } = board;

  const isRemote = adminType === "remote";
  const canOverride = adminType === "primary" || adminType === "co";
  const canEndDay = adminType === "primary" || adminType === "co";
  const authorName = currentAdmin?.name ?? "Manager";
  const rosaStatus = availability.status;
  // One helper's chip says nothing about a staff of forty: count who's on shift.
  const onShift =
    activeHelpers.length > 1
      ? {
          on: activeHelpers.filter((h) => {
            const row = staffProfiles.find((p) => p.id === h.id);
            return (
              statusFor(h.id, schedules, clock.nowTs, manualFromRow(row), timeOff.list).status ===
              "on_shift"
            );
          }).length,
          total: activeHelpers.length,
        }
      : undefined;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [confirmingEndDay, setConfirmingEndDay] = useState(false);

  // Which day the Pass shows (client feedback 2026-10-02: "I should be able
  // to move through dates from Pass view"). Today is the live board; another
  // day reads the same tasks Schedule shows for it.
  const todayIso = toISODate(simDate);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const shownIso = pickedDay ?? todayIso;
  const isToday = shownIso === todayIso;
  const shownDate = parseISODate(shownIso);
  const otherDay = usePlannerTasks({
    token: isToday ? null : session.token,
    fromIso: startOfDayIso(shownDate),
    toIso: startOfDayIso(addDays(shownDate, 1)),
    helpers,
    boardTasks: tasks,
  });
  const shiftDay = (n: number) => {
    const next = toISODate(addDays(shownDate, n));
    setPickedDay(next === todayIso ? null : next);
  };

  // The Pass is day-by-day: anything scheduled for a later day sits in
  // "Coming up" and counts toward none of today's numbers.
  const onBoard = tasks.filter((t) => !t.queued && !t.suggested);
  const active = isToday
    ? onBoard.filter((t) => !isLaterThanToday(t, clock.nowTs))
    : (otherDay.tasks ?? []).filter((t) => !t.queued && !t.suggested);
  const upcoming = isToday ? onBoard.filter((t) => isLaterThanToday(t, clock.nowTs)) : [];
  const pastDue = onBoard
    .filter((t) => !isLaterThanToday(t, clock.nowTs))
    .filter((t) => isPastDue(t, clock.nowTs));
  const pendingLeave = timeOff.leave.filter((l) => l.status === "pending");
  const leaveTaskCounts = useOpenTaskCounts(
    canOverride ? session.token : null,
    pendingLeave.map((l) => ({ key: l.id, ...l })),
  );
  const gate = useSendGate({
    token: session.token,
    authorName,
    isRemote,
    schedules,
    nowTs: clock.nowTs,
    helperProfiles: staffProfiles,
    resolveHelperName: (id) => helpers.find((h) => h.id === id)?.name ?? "your helper",
    utosTargetHelperId: utosRecipientId,
    activeHelpers,
    timeOff: timeOff.list,
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
        pendingLeave={pendingLeave}
        leaveTaskCounts={leaveTaskCounts}
        onDecideLeave={
          canOverride ? (id, d, opts) => void timeOff.decideLeave(id, d, opts) : undefined
        }
        helpers={helpers}
        activeHelpers={activeHelpers}
        shownDate={shownDate}
        isToday={isToday}
        dayLoading={!isToday && otherDay.tasks === null}
        onShiftDay={shiftDay}
        onToday={() => setPickedDay(null)}
        boardClosed={boardClosed}
        rosaStatus={rosaStatus}
        helperName={helper?.name ?? "your helper"}
        onShift={onShift}
        authorName={authorName}
        isRemote={isRemote}
        canEndDay={canEndDay}
        onEndDay={() => setConfirmingEndDay(true)}
        onReopenDay={() => setClosed(false)}
        onReschedule={rescheduleTask}
        onEditTask={setEditing}
        onCancelTask={cancelTask}
        onDecideVale={vales.decide}
        onResolveFlag={inviteStore.resolveFlag}
        onApproveSuggestion={approveSuggestion}
        onDismissSuggestion={dismissSuggestion}
        onNewTask={() => setOpen(true)}
        quickUtos={
          <QuickUtosLauncher
            onSend={gate.sendUtos}
            helperName={activeHelpers.find((h) => h.id === utosRecipientId)?.name ?? "your helper"}
            activeHelpers={activeHelpers}
            selectedHelperId={utosRecipientId}
            onSelectHelper={setUtosRecipientId}
          />
        }
        view={view}
        onViewChange={onViewChange}
      />

      {open && (
        <NewTaskModal
          activeHelpers={activeHelpers}
          isRemote={isRemote}
          defaultDate={shownIso < todayIso ? todayIso : shownIso}
          scheduleFor={schedules.scheduleFor}
          timeOff={timeOff.list}
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
          timeOff={timeOff.list}
          token={session.token}
          myUserId={session.userId}
          onClose={() => setEditing(null)}
          onSave={(edit) => {
            void editTask(editing.id, edit);
            setEditing(null);
          }}
          onStopRepeating={
            isRemote
              ? undefined
              : () => {
                  void stopRepeating(editing.routineId ?? editing.id);
                  setEditing(null);
                }
          }
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
      {confirmingEndDay && (
        <EndDayModal
          onConfirm={() => {
            setClosed(true);
            setConfirmingEndDay(false);
          }}
          onCancel={() => setConfirmingEndDay(false)}
        />
      )}
    </>
  );
}
