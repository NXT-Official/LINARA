import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Moon,
  Plus,
  Wallet,
  ClipboardList,
  Sparkles,
  AlertCircle,
  HelpCircle,
  Link2,
  CalendarClock,
  Users,
  Columns3,
  Package,
  Calendar,
} from "lucide-react";

import { BottomNav } from "@/components/shared/bottom-nav";
import { RecurrenceBadge } from "@/features/tasks/components/recurrence-badge";

import { GroceryProvider } from "@/features/groceries/components/grocery-provider";
import { GrocerySection } from "@/features/groceries/components/grocery-section";
import { PalengkeChip } from "@/features/groceries/components/palengke-chip";
import { TodaysSpendDial } from "@/features/groceries/components/todays-spend-dial";
import { PantrySection } from "@/features/pantry/components/pantry-section";
import { usePantry, type PantryStore } from "@/features/pantry/hooks/use-pantry";

import { BlockReasonModal } from "@/features/tasks/components/block-reason-modal";
import { HelperLane } from "@/features/tasks/components/helper-lane";
import { MySuggestions } from "@/features/tasks/components/my-suggestions";
import { NewTaskModal } from "@/features/tasks/components/new-task-modal";
import { NextTaskCard } from "@/features/tasks/components/next-task-card";
import { RescheduleNotice } from "@/features/tasks/components/reschedule-notice";
import { RoutinesView } from "@/features/tasks/components/routines-view";
import { SuggestionsInbox } from "@/features/tasks/components/suggestions-inbox";
import { TaskCard } from "@/features/tasks/components/task-card";
import { TheBoardStatusLists } from "@/features/tasks/components/the-board-status-lists";

import { useTaskBoard } from "@/features/tasks/hooks/use-task-board";

import { AppointmentsSection } from "@/features/appointments/components/appointments-section";
import { MyWeekCard } from "@/features/shifts/components/my-week-card";
import { ShiftsSection } from "@/features/shifts/components/shifts-section";

import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import { useSimClock } from "@/features/dashboard/hooks/use-sim-clock";
import { useSchedules } from "@/features/shifts/hooks/use-schedules";

import type { AppointmentStore } from "@/features/appointments/hooks/use-appointments";
import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";

import { AvailabilityGate } from "@/features/availability/components/availability-gate";
import { RosaAvailControl } from "@/features/availability/components/rosa-avail-control";
import { RosaStatusChip } from "@/features/availability/components/rosa-status-chip";
import { EndOfDay } from "@/features/dashboard/components/end-of-day";
import { NeedsYou } from "@/features/dashboard/components/needs-you";
import { RemoteGlance } from "@/features/dashboard/components/remote-glance";
import { TopBar } from "@/features/dashboard/components/top-bar";
import { AfterHoursLedger } from "@/features/ledger/components/after-hours-ledger";
import { PayRecord } from "@/features/ledger/components/pay-record";
import { MyNotes } from "@/features/notes/components/my-notes";
import { NoteToTaskModal } from "@/features/notes/components/note-to-task-modal";
import { ClaimAccountFlow } from "@/features/people/components/claim-account-flow";
import { ClaimedWelcome } from "@/features/people/components/claimed-welcome";
import { PeopleSection } from "@/features/people/components/people-section";
import { QuickUtosFeed } from "@/features/utos/components/quick-utos-feed";
import { QuickUtosLauncher } from "@/features/utos/components/quick-utos-launcher";

import type { Availability } from "@/features/availability/hooks/use-availability";
import { useAvailability } from "@/features/availability/hooks/use-availability";
import { useLedger, type LedgerStore } from "@/features/ledger/hooks/use-ledger";
import { useVales, type ValeStore } from "@/features/ledger/hooks/use-vales";
import { useInvites, type InviteStore } from "@/features/people/hooks/use-invites";
import { useSession, type Session } from "@/features/people/hooks/use-session";
import { useUtos, type SendFlags, type UtosStore } from "@/features/utos/hooks/use-utos";
import type { TaskBoard } from "@/features/tasks/hooks/use-task-board";

export const Route = createFileRoute("/")({
  component: LinaraApp,
});

import { HELPERS } from "@/features/people/people.constants";
import type { Helper, Invite } from "@/features/people/people.types";
import { helperById } from "@/features/people/people.utils";
import type { Task } from "@/features/tasks/task.types";
import { isPalengke } from "@/features/tasks/task.utils";
import { formatSimDate, weekdayOf } from "@/lib/time";

function LinaraApp() {
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

// ---------- Manager view ----------
function ManagerView({
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
  const [passMode, setPassMode] = useState<"line" | "board">("line");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("linara.passMode");
      if (stored === "board" || stored === "line") setPassMode(stored);
    } catch {
      // ignore
    }
  }, []);
  const updatePassMode = (m: "line" | "board") => {
    setPassMode(m);
    if (typeof window !== "undefined") window.localStorage.setItem("linara.passMode", m);
  };
  const active = tasks.filter((t) => !t.queued && !t.suggested);
  const queued = tasks.filter((t) => t.queued);
  const suggestions = tasks.filter((t) => t.suggested);
  const blocked = active.filter((t) => t.status === "blocked");
  const pendingVales = vales.filter((v) => v.status === "pending");
  const counts = useMemo(
    () => ({
      done: active.filter((t) => t.status === "done").length,
      inProg: active.filter((t) => t.status === "in_progress").length,
      todo: active.filter((t) => t.status === "todo" || t.status === "blocked").length,
      total: active.length,
    }),
    [active],
  );

  // Availability gate — friction wall for sends to a helper who is Off.
  type GatePayload =
    | { kind: "utos"; content: string }
    | { kind: "task"; task: Omit<Task, "id" | "status" | "station"> };
  const [gate, setGate] = useState<GatePayload | null>(null);
  const rosaOff = rosaStatus.status === "off";
  const stampTask = (
    t: Omit<Task, "id" | "status" | "station">,
  ): Omit<Task, "id" | "status" | "station"> => ({ ...t, createdBy: t.createdBy ?? authorName });
  const gatedSendUtos = (content: string) => {
    if (rosaOff) setGate({ kind: "utos", content });
    else onSendUtos(content, { from: authorName });
  };
  const gatedAddTask = (
    t: Omit<Task, "id" | "status" | "station">,
    opts: { sendLive?: boolean } = {},
  ) => {
    // Remote admins queue tasks as suggestions for on-site managers by default.
    if (isRemote && !opts.sendLive) {
      onAdd(stampTask(t), { suggested: true });
      return;
    }
    if (t.helperId === "rosa" && rosaOff) setGate({ kind: "task", task: stampTask(t) });
    else onAdd(stampTask(t), {});
  };
  const gateResolve = (choice: "queue" | "override" | "emergency") => {
    if (!gate) return;
    if (gate.kind === "utos") {
      if (choice === "queue")
        onSendUtos(gate.content, { waiting: true, afterHours: true, from: authorName });
      else if (choice === "override")
        onSendUtos(gate.content, { afterHours: true, from: authorName });
      else onSendUtos(gate.content, { afterHours: true, emergency: true, from: authorName });
    } else {
      const task = stampTask(gate.task);
      if (choice === "queue") onAdd(task, { queuedForShift: true, afterHours: true });
      else if (choice === "override") onAdd(task, { afterHours: true });
      else onAdd(task, { afterHours: true, emergency: true });
    }
    setGate(null);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Pass mode switch — only on Pass tab */}
      {view === "pass" && (
        <div className="flex items-center justify-end gap-3">
          <div
            className="inline-flex rounded-full border border-border bg-card p-1 shadow-soft"
            role="tablist"
            aria-label="Pass layout"
          >
            {[
              { key: "line" as const, label: "The Line", Icon: Users },
              { key: "board" as const, label: "The Board", Icon: Columns3 },
            ].map(({ key, label, Icon }) => {
              const active = passMode === key;
              return (
                <button
                  key={key}
                  onClick={() => updatePassMode(key)}
                  aria-label={label}
                  aria-pressed={active}
                  title={label}
                  className={`grid h-8 w-8 place-items-center rounded-full transition ${
                    active
                      ? "bg-primary text-primary-foreground shadow-soft"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {view === "pass" && (
        <>
          {/* Status line */}
          <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-7">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  The Pass · Today
                </div>
                <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {formatSimDate(simDate)}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {boardClosed && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                    <Moon className="h-3 w-3" /> Board closed
                  </span>
                )}
                {canStartNewDay && (
                  <button
                    onClick={onStartNewDay}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-soft transition hover:bg-primary/5"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Start new day
                  </button>
                )}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="font-display text-lg text-foreground">{weekdayOf(simDate)}</span>
              <span className="text-muted-foreground">·</span>
              <span className="inline-flex items-center gap-1.5 text-sm">
                <span className="h-2 w-2 rounded-full bg-[oklch(0.68_0.14_150)]" />
                <span className="font-semibold text-foreground tabular-nums">{counts.done}</span>
                <span className="text-muted-foreground">done</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm">
                <span className="h-2 w-2 rounded-full bg-accent" />
                <span className="font-semibold text-foreground tabular-nums">{counts.inProg}</span>
                <span className="text-muted-foreground">doing</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm">
                <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                <span className="font-semibold text-foreground tabular-nums">{counts.todo}</span>
                <span className="text-muted-foreground">to-do</span>
              </span>
              <span className="ml-auto">
                <RosaStatusChip status={rosaStatus} />
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {boardClosed
                ? "The day is done. New tasks are being queued for tomorrow."
                : `${weekdayOf(simDate) === "Sun" ? "Sunday" : "A calm"} morning. Everyone is at their station.`}
            </p>
          </section>

          {/* Needs you */}
          <NeedsYou
            blocked={blocked}
            pendingVales={pendingVales}
            onReschedule={onReschedule}
            onDecideVale={onDecideVale}
            flaggedInvites={invites.filter((i) => i.flags.length > 0)}
            onResolveFlag={onResolveFlag}
          />

          {/* Remote-admin OFW glance */}
          {isRemote && (
            <RemoteGlance active={active} helperName={helperName} adminName={authorName} />
          )}

          {/* Suggestions from remote admins (approve onto the board) */}
          {!isRemote && suggestions.length > 0 && (
            <SuggestionsInbox
              suggestions={suggestions}
              onApprove={onApproveSuggestion}
              onDismiss={onDismissSuggestion}
            />
          )}
          {isRemote && suggestions.length > 0 && (
            <MySuggestions
              suggestions={suggestions}
              onWithdraw={onDismissSuggestion}
              adminName={authorName}
            />
          )}

          {/* The Pass — Line or Board */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h2 className="font-display text-xl text-foreground">
                  {passMode === "line" ? "The Line" : "The Board"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {passMode === "line"
                    ? "Tap a lane to see the full day."
                    : "By status, in time order."}
                </p>
              </div>
              <button
                onClick={() => setOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep"
              >
                <Plus className="h-3.5 w-3.5" /> New task
              </button>
            </div>
            {passMode === "line" ? (
              <div className="space-y-3">
                {HELPERS.map((h) => (
                  <HelperLane
                    key={h.id}
                    helper={h}
                    tasks={active.filter((t) => t.helperId === h.id)}
                  />
                ))}
              </div>
            ) : (
              <TheBoardStatusLists tasks={active} />
            )}
          </section>

          {/* Compact spend / payday dials */}
          <div className="grid gap-3 sm:grid-cols-2">
            <TodaysSpendDial />
            <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Next payday
                </div>
                <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="mt-1.5 font-display text-2xl text-foreground">Jul 15</div>
              <div className="mt-0.5 text-xs text-muted-foreground">8 days away</div>
            </div>
          </div>
        </>
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
          <QuickUtosLauncher onSend={gatedSendUtos} helperName={helperName} />
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
          <div className="grid gap-3 sm:grid-cols-2">
            <TodaysSpendDial />
            <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Next payday
                </div>
                <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="mt-1.5 font-display text-2xl text-foreground">Jul 15</div>
              <div className="mt-0.5 text-xs text-muted-foreground">8 days away</div>
            </div>
          </div>
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
            gatedAddTask(t, opts);
            setOpen(false);
          }}
        />
      )}
      {gate && (
        <AvailabilityGate
          intent={gate}
          status={rosaStatus}
          helperName={helperName}
          canOverride={canOverride}
          onCancel={() => setGate(null)}
          onChoose={gateResolve}
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

// ---------- Helper view ----------

function HelperView({
  helper,
  board,
  ledgerStore,
  valeStore,
  pantry,
  schedules,
  availability,
  inviteStore,
  utos,
}: {
  helper: Helper;
  board: TaskBoard;
  ledgerStore: LedgerStore;
  valeStore: ValeStore;
  pantry: PantryStore;
  schedules: ScheduleStore;
  availability: Availability;
  inviteStore: InviteStore;
  utos: UtosStore;
}) {
  const {
    tasks,
    boardClosed,
    simDate,
    updateStatus: onUpdate,
    blockTask: onBlock,
    addTask: onAddTask,
  } = board;
  const {
    entries: ledger,
    resolutionDefault: ledgerDefault,
    updateEntry: onUpdateLedgerEntry,
  } = ledgerStore;
  const vales = valeStore.vales.filter((v) => v.helperId === helper.id);
  const onRequestVale = (amount: number, reason: string) =>
    valeStore.request(helper.id, amount, reason);
  const { list: utosList, wipedToday: utosWipedToday, ack: onAckUtos } = utos;
  const rosaStatus = availability.status;
  const weekSchedule = schedules.weekFor(helper.id);
  const {
    invites,
    findByCode: onFindInvite,
    claim: onClaimInvite,
    flag: onFlagInvite,
  } = inviteStore;

  const [claimOpen, setClaimOpen] = useState(false);
  const [claimedInfo, setClaimedInfo] = useState<Invite | null>(null);
  const myClaimed = invites.find((i) => i.status === "active");
  const [tab, setTab] = useState<"today" | "pay" | "pantry">("today");
  const [noteToTask, setNoteToTask] = useState<string | null>(null);
  const [blockingId, setBlockingId] = useState<string | null>(null);
  const mine = tasks.filter((t) => t.helperId === helper.id && !t.queued);
  const doneCount = mine.filter((t) => t.status === "done").length;
  const activeCount = mine.filter((t) => t.status !== "done" && t.status !== "blocked").length;
  const allDone = boardClosed || (activeCount === 0 && doneCount > 0);
  const next = mine.find((t) => t.status !== "done" && t.status !== "blocked");
  const upcoming = mine.filter(
    (t) => t.status !== "done" && t.status !== "blocked" && t.id !== next?.id,
  );
  const blocked = mine.filter((t) => t.status === "blocked");
  const completed = mine.filter((t) => t.status === "done");
  const blockingTask = mine.find((t) => t.id === blockingId) ?? null;

  return (
    <div className="space-y-5 pb-24">
      {/* Greeting */}
      <section className="rounded-3xl bg-primary p-6 text-primary-foreground shadow-lift sm:p-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground/70">
          Ate Rosa's Station
        </div>
        <h1 className="mt-2 font-display text-[26px] leading-tight sm:text-3xl">
          Magandang umaga, Ate Rosa.
        </h1>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-primary-foreground/10 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70">
              Today's shift
            </div>
            <div className="mt-0.5 font-semibold">{helper.shift}</div>
          </div>
          <div className="rounded-2xl bg-primary-foreground/10 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70">
              Rest day
            </div>
            <div className="mt-0.5 font-semibold">{helper.restDay}</div>
          </div>
        </div>
        <RosaAvailControl
          status={rosaStatus}
          onAvailable={availability.setAvailable}
          onOff={availability.setOff}
        />
      </section>

      <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-terracotta/50 bg-terracotta-soft/25 px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-foreground">
            {myClaimed
              ? `Account claimed — welcome, ${myClaimed.claimedName}`
              : "New here? Claim your account."}
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {myClaimed
              ? "Your record stays with you, even if you change households."
              : "Enter the invite code your employer gave you. Your account will be yours."}
          </p>
        </div>
        {!myClaimed && (
          <button
            onClick={() => setClaimOpen(true)}
            className="shrink-0 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
          >
            Enter code
          </button>
        )}
      </div>

      {tab === "today" ? (
        <>
          <MyWeekCard weekSchedule={weekSchedule} simDate={simDate} />
          {(utosList.length > 0 || utosWipedToday) && (
            <QuickUtosFeed
              utosList={utosList}
              onAck={onAckUtos}
              available={!boardClosed}
              wiped={utosWipedToday}
            />
          )}
          <MyNotes helperId={helper.id} onMakeTask={(txt) => setNoteToTask(txt)} />
          {allDone ? (
            <EndOfDay doneCount={doneCount} />
          ) : (
            <div className="space-y-4">
              {next && (
                <NextTaskCard
                  task={next}
                  onUpdate={onUpdate}
                  onAskBlock={() => setBlockingId(next.id)}
                />
              )}
              {upcoming.length > 0 && (
                <div>
                  <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Later today
                  </h3>
                  <div className="space-y-2">
                    {upcoming.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft"
                      >
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-xs font-semibold text-pine-deep">
                            {t.time.split(" ")[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {t.title}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2">
                              <span className="truncate text-xs text-muted-foreground">
                                {t.time}
                              </span>
                              <RecurrenceBadge recurrence={t.recurrence} />
                              {t.appointmentTitle && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-1.5 py-0.5 text-[10px] font-medium text-[oklch(0.38_0.09_60)]">
                                  <Link2 className="h-2.5 w-2.5" /> {t.appointmentTitle}
                                </span>
                              )}
                              {isPalengke(t) && <PalengkeChip compact />}
                            </div>
                          </div>
                          {t.status === "in_progress" && (
                            <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                              In progress
                            </span>
                          )}
                          <button
                            onClick={() => setBlockingId(t.id)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:border-accent/60 hover:text-accent-foreground"
                            aria-label="Can't now or need info"
                          >
                            <HelpCircle className="h-3 w-3" /> Can't now
                          </button>
                        </div>
                        <RescheduleNotice notice={t.rescheduleNotice} newTime={t.time} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {blocked.length > 0 && (
                <div>
                  <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Waiting for Ma'am · {blocked.length}
                  </h3>
                  <div className="space-y-2">
                    {blocked.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-2xl border border-terracotta/40 bg-terracotta-soft/40 p-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {t.title}
                            </div>
                            <div className="text-[11px] text-muted-foreground">{t.time}</div>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                            <AlertCircle className="h-3 w-3" /> Blocked
                          </span>
                        </div>
                        <p className="mt-1.5 rounded-xl bg-card/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
                          "{t.blockReason}"
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {completed.length > 0 && (
                <div>
                  <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Done · {completed.length}
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {completed.map((t) => (
                      <div
                        key={t.id}
                        className="rounded-2xl border border-border/70 bg-card p-2 shadow-soft"
                      >
                        {t.photo && (
                          <img
                            src={t.photo}
                            alt=""
                            className="mb-2 h-16 w-full rounded-lg object-cover"
                          />
                        )}
                        <div className="line-clamp-1 px-1 text-xs font-semibold text-foreground">
                          {t.title}
                        </div>
                        <div className="px-1 text-[10px] text-muted-foreground">{t.time}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      ) : tab === "pantry" ? (
        <div className="space-y-5">
          <PantrySection pantry={pantry} />
          <GrocerySection />
        </div>
      ) : (
        <PayRecord
          vales={vales}
          onRequestVale={onRequestVale}
          ledger={ledger}
          ledgerDefault={ledgerDefault}
          onUpdateLedgerEntry={onUpdateLedgerEntry}
          helper={helper}
          myInvite={myClaimed ?? null}
        />
      )}

      {blockingTask && (
        <BlockReasonModal
          task={blockingTask}
          onClose={() => setBlockingId(null)}
          onSubmit={(reason) => {
            onBlock(blockingTask.id, reason);
            setBlockingId(null);
          }}
        />
      )}

      {noteToTask !== null && (
        <NoteToTaskModal
          initialTitle={noteToTask}
          helperId={helper.id}
          onClose={() => setNoteToTask(null)}
          onSubmit={(t) => {
            onAddTask(t);
            setNoteToTask(null);
          }}
        />
      )}

      {claimOpen && (
        <ClaimAccountFlow
          onClose={() => setClaimOpen(false)}
          onFindInvite={onFindInvite}
          onClaim={(id, name) => {
            onClaimInvite(id, name);
          }}
          onFlag={onFlagInvite}
          onFinished={(inv) => {
            setClaimOpen(false);
            setClaimedInfo(inv);
            setTab("today");
          }}
        />
      )}
      {claimedInfo && <ClaimedWelcome invite={claimedInfo} onClose={() => setClaimedInfo(null)} />}

      <BottomNav
        active={tab}
        onChange={(k) => setTab(k as typeof tab)}
        items={[
          { key: "today", label: "Today", Icon: ClipboardList },
          { key: "pantry", label: "Pantry", Icon: Package },
          { key: "pay", label: "My Pay", Icon: Wallet },
        ]}
      />
    </div>
  );
}

// ---------- Rosa's private notes ----------
