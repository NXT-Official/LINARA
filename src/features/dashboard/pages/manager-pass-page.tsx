import { useState } from "react";

import { AvailabilityGate } from "@/features/availability/components/availability-gate";
import { useSendGate } from "@/features/availability/hooks/use-send-gate";
import { NewTaskModal } from "@/features/tasks/components/new-task-modal";

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
  const {
    tasks,
    boardClosed,
    simDate,
    addTask,
    rescheduleTask,
    approveSuggestion,
    dismissSuggestion,
  } = board;

  const isRemote = adminType === "remote";
  const canOverride = adminType === "primary" || adminType === "co";
  const canStartNewDay = adminType === "primary" || adminType === "co";
  const authorName = currentAdmin?.name ?? "Manager";
  const rosaStatus = availability.status;

  const [open, setOpen] = useState(false);
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

  const active = tasks.filter((t) => !t.queued && !t.suggested);
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
        suggestions={tasks.filter((t) => t.suggested)}
        blocked={active.filter((t) => t.status === "blocked")}
        pendingVales={vales.vales.filter((v) => v.status === "pending")}
        flaggedInvites={inviteStore.invites.filter((i) => i.flags.length > 0)}
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
