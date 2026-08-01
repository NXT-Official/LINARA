import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Moon,
  Plus,
  Check,
  Wallet,
  ClipboardList,
  X,
  Sparkles,
  AlertCircle,
  MessageCircle,
  RotateCcw,
  HelpCircle,
  Coins,
  Send,
  Mic,
  Zap,
  Link2,
  CalendarClock,
  Trash2,
  Users,
  Columns3,
  Package,
  Calendar,
  StickyNote,
} from "lucide-react";

import { BottomNav } from "@/components/shared/bottom-nav";
import { Avatar } from "@/components/shared/avatar";
import { Row, ReviewRow } from "@/components/shared/detail-row";
import { Field } from "@/components/shared/field";
import { statusMeta } from "@/features/availability/availability.utils";
import { fmtHoursMinutes, ledgerEntryMinutes, reasonLabel } from "@/features/ledger/ledger.utils";
import { RecurrenceBadge } from "@/features/tasks/components/recurrence-badge";
import { useMounted } from "@/hooks/use-mounted";

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

import { useTaskBoard, type CompletionRecord } from "@/features/tasks/hooks/use-task-board";

import { AppointmentsSection } from "@/features/appointments/components/appointments-section";
import { SimClock } from "@/features/dashboard/components/sim-clock";
import { MyWeekCard } from "@/features/shifts/components/my-week-card";
import { ShiftsSection } from "@/features/shifts/components/shifts-section";

import { useAppointments } from "@/features/appointments/hooks/use-appointments";
import { useSimClock } from "@/features/dashboard/hooks/use-sim-clock";
import { useSchedules } from "@/features/shifts/hooks/use-schedules";

import type { AppointmentStore } from "@/features/appointments/hooks/use-appointments";
import type { ScheduleStore } from "@/features/shifts/hooks/use-schedules";

export const Route = createFileRoute("/")({
  component: LinaraApp,
});

import { QUIET_END_HOUR, QUIET_START_HOUR } from "@/features/availability/availability.constants";
import type { RosaStatus } from "@/features/availability/availability.types";
import type {
  LedgerEntry,
  LedgerReason,
  LedgerResolution,
  ValeRequest,
} from "@/features/ledger/ledger.types";
import type { MyNote } from "@/features/notes/note.types";
import {
  adminPermSummary,
  adminTypeLabel,
  adminTypeShort,
  HELPERS,
  INITIAL_ADMINS,
  stationTone,
} from "@/features/people/people.constants";
import type {
  Admin,
  AdminType,
  Employment,
  Helper,
  Invite,
  Station,
  ViewAs,
} from "@/features/people/people.types";
import { helperById } from "@/features/people/people.utils";
import type { WeekSchedule } from "@/features/shifts/shift.types";
import { isMinuteInDay } from "@/features/shifts/shift.utils";
import type { Routine, Status, Task } from "@/features/tasks/task.types";
import { isPalengke } from "@/features/tasks/task.utils";
import { QUICK_UTOS_PRESETS } from "@/features/utos/utos.constants";
import type { QuickUtos } from "@/features/utos/utos.types";
import {
  formatSimDate,
  formatTimeOfDay,
  parseHM,
  WEEKDAY_LONG,
  WEEKDAYS,
  weekdayOf,
} from "@/lib/time";

function LinaraApp() {
  const [viewAs, setViewAs] = useState<ViewAs>("ben");
  const [admins, setAdmins] = useState<Admin[]>(INITIAL_ADMINS);
  const currentAdmin = admins.find((a) => a.id === viewAs) ?? null;
  const role: "manager" | "helper" = viewAs === "rosa" ? "helper" : "manager";
  const adminType: AdminType | null = currentAdmin ? currentAdmin.type : null;
  const updateAdminType = (id: string, type: AdminType) =>
    setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, type } : a)));
  const [vales, setVales] = useState<ValeRequest[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerDefault, setLedgerDefault] = useState<LedgerResolution>("rest");
  const [utosList, setUtosList] = useState<QuickUtos[]>([]);
  const [utosWipedToday, setUtosWipedToday] = useState(false);
  const [invites, setInvites] = useState<Invite[]>([]);
  const addInvite = (
    data: Omit<Invite, "id" | "code" | "createdAt" | "createdBy" | "status" | "flags">,
    byName: string,
  ): Invite => {
    const code = `LINARA-${Math.floor(1000 + Math.random() * 9000)}`;
    const inv: Invite = {
      ...data,
      id: `inv${Date.now()}`,
      code,
      createdAt: Date.now(),
      createdBy: byName,
      status: "pending",
      flags: [],
    };
    setInvites((prev) => [inv, ...prev]);
    return inv;
  };
  const removeInvite = (id: string) => setInvites((prev) => prev.filter((i) => i.id !== id));
  const findInviteByCode = (code: string) =>
    invites.find(
      (i) => i.code.toLowerCase() === code.trim().toLowerCase() && i.status === "pending",
    ) ?? null;
  const claimInvite = (id: string, claimedName: string) => {
    setInvites((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, status: "active", claimedName, claimedAt: Date.now() } : i,
      ),
    );
  };
  const flagInvite = (id: string, field: string, note?: string) => {
    setInvites((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, flags: [...i.flags, { id: `f${Date.now()}`, field, note, at: Date.now() }] }
          : i,
      ),
    );
  };
  const resolveInviteFlag = (inviteId: string, flagId: string) => {
    setInvites((prev) =>
      prev.map((i) =>
        i.id === inviteId ? { ...i, flags: i.flags.filter((f) => f.id !== flagId) } : i,
      ),
    );
  };
  const pantry = usePantry();
  const schedules = useSchedules();
  const { nowTs, offsetMs: simOffsetMs, setOffsetMs: setSimOffsetMs } = useSimClock();

  const currentHelperId = "rosa";

  const [rosaAvail, setRosaAvail] = useState<{
    manual: "available" | "off";
    availableUntil: number | null;
  }>({ manual: "off", availableUntil: null });
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("linara.rosaAvail");
      if (raw) setRosaAvail(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("linara.rosaAvail", JSON.stringify(rosaAvail));
    } catch {
      // ignore
    }
  }, [rosaAvail]);
  // Auto-return to Off when the "Available until" window expires.
  useEffect(() => {
    if (
      rosaAvail.manual === "available" &&
      rosaAvail.availableUntil &&
      rosaAvail.availableUntil <= nowTs
    ) {
      setRosaAvail({ manual: "off", availableUntil: null });
    }
  }, [nowTs, rosaAvail]);
  const rosaStatus: RosaStatus = useMemo(() => {
    const d = new Date(nowTs);
    const h = d.getHours();
    const wd = weekdayOf(d);
    const daySched = schedules.weekFor("rosa")[wd];
    const isRestDay = daySched.rest;
    const isQuiet = h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
    const minutes = h * 60 + d.getMinutes();
    const onShift = !isQuiet && isMinuteInDay(minutes, daySched);
    if (isQuiet) return { status: "off", until: null, quiet: true, restDay: isRestDay };
    if (onShift) return { status: "on_shift", until: null, quiet: false, restDay: false };
    if (
      rosaAvail.manual === "available" &&
      rosaAvail.availableUntil &&
      rosaAvail.availableUntil > nowTs
    ) {
      return {
        status: "available",
        until: rosaAvail.availableUntil,
        quiet: false,
        restDay: isRestDay,
      };
    }
    return { status: "off", until: null, quiet: false, restDay: isRestDay };
  }, [nowTs, rosaAvail, schedules]);
  const setRosaAvailable = (hours: number) => {
    if (rosaStatus.quiet) return; // quiet hours are hard-off
    setRosaAvail({ manual: "available", availableUntil: nowTs + hours * 60 * 60 * 1000 });
  };
  const setRosaOff = () => setRosaAvail({ manual: "off", availableUntil: null });

  type SendFlags = { afterHours?: boolean; emergency?: boolean; waiting?: boolean; from?: string };
  const sendQuickUtos = (content: string, flags: SendFlags = {}) => {
    const toHelper = helperById(currentHelperId);
    setUtosList((prev) => [
      ...prev,
      {
        id: `u${Date.now()}`,
        content,
        from: flags.from ?? "Manager",
        to: toHelper.name,
        timestamp: Date.now(),
        ackState: "sent",
        afterHours: flags.afterHours,
        emergency: flags.emergency,
        waiting: flags.waiting,
      },
    ]);
    setUtosWipedToday(false);
  };

  const logLedger = (partial: Omit<LedgerEntry, "id" | "adjustMinutes" | "resolution">) => {
    setLedger((prev) => [
      ...prev,
      {
        ...partial,
        id: `l${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        adjustMinutes: 0,
        resolution: ledgerDefault,
      },
    ]);
  };

  // Classify an off-shift completion against Rosa's real schedule.
  const classifyRosaReason = (ts: number, emergency: boolean): LedgerReason => {
    if (emergency) return "emergency";
    const d = new Date(ts);
    const wd = weekdayOf(d);
    const day = schedules.weekFor("rosa")[wd];
    if (day.rest) return "rest_day";
    const minutes = d.getHours() * 60 + d.getMinutes();
    if (
      day.breakStart &&
      day.breakEnd &&
      minutes >= parseHM(day.breakStart) &&
      minutes < parseHM(day.breakEnd)
    ) {
      return "rest_break";
    }
    if (rosaStatus.status === "available") return "available";
    return "override";
  };

  const ackUtos = (id: string, ack: "seen" | "done") => {
    setUtosList((prev) => {
      const u = prev.find((x) => x.id === id);
      const next = prev.map((x) => (x.id === id ? { ...x, ackState: ack } : x));
      if (u && ack === "done") {
        // Utos completed off-shift: a small after-hours ledger entry (5 min).
        logCompletion({
          sourceId: u.id,
          kind: "utos",
          title: u.content,
          helperId: currentHelperId,
          startTs: u.timestamp,
          doneTs: nowTs,
          autoMinutes: 5,
          emergency: !!u.emergency,
        });
      }
      return next;
    });
  };

  // A completion only reaches the ledger when Rosa worked outside her shift.
  const logCompletion = (record: CompletionRecord) => {
    if (record.helperId !== "rosa" || rosaStatus.status === "on_shift") return;
    logLedger({
      sourceId: record.sourceId,
      kind: record.kind,
      title: record.title,
      station: record.station,
      appointmentTitle: record.appointmentTitle,
      startTs: record.startTs,
      doneTs: record.doneTs,
      autoMinutes: record.autoMinutes,
      reason: classifyRosaReason(record.doneTs, record.emergency),
    });
  };

  const board = useTaskBoard({ nowTs, onComplete: logCompletion });
  const appointments = useAppointments(board.setTasks);
  const {
    tasks,
    routines,
    boardClosed,
    simDate,
    addTask,
    updateStatus,
    blockTask,
    rescheduleTask,
    approveSuggestion,
    dismissSuggestion,
    setClosed,
    addRoutine,
    removeRoutine,
  } = board;

  const updateLedgerEntry = (
    id: string,
    patch: Partial<Pick<LedgerEntry, "adjustMinutes" | "resolution">>,
  ) => {
    setLedger((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const requestVale = (helperId: string, amount: number, reason: string) => {
    setVales((prev) => [
      ...prev,
      { id: `v${Date.now()}`, helperId, amount, reason, status: "pending" },
    ]);
  };

  const decideVale = (id: string, decision: "approved" | "declined") => {
    setVales((prev) => prev.map((v) => (v.id === id ? { ...v, status: decision } : v)));
  };

  const startNewDay = () => {
    // Nightly wipe: quick utos are genuinely deleted from state — no history array, no log.
    setUtosWipedToday(utosList.length > 0);
    setUtosList([]);
    board.startNewDay();
  };

  return (
    <div className="min-h-screen bg-background">
      <TopBar
        viewAs={viewAs}
        onViewAsChange={setViewAs}
        admins={admins}
        boardClosed={boardClosed}
        onBoardClosedChange={setClosed}
        nowTs={nowTs}
        simOffsetMs={simOffsetMs}
        onSimOffsetChange={setSimOffsetMs}
        adminType={adminType}
      />
      <GroceryProvider pantry={pantry}>
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6 sm:pt-6">
          {role === "manager" ? (
            <ManagerView
              admins={admins}
              adminType={adminType}
              currentAdmin={currentAdmin}
              onUpdateAdminType={updateAdminType}
              tasks={tasks}
              vales={vales}
              routines={routines}
              appointments={appointments}
              simDate={simDate}
              onAdd={addTask}
              onApproveSuggestion={approveSuggestion}
              onDismissSuggestion={dismissSuggestion}
              onReschedule={rescheduleTask}
              onDecideVale={decideVale}
              onAddRoutine={addRoutine}
              onRemoveRoutine={removeRoutine}
              onStartNewDay={startNewDay}
              onSendUtos={sendQuickUtos}
              boardClosed={boardClosed}
              helperName={helperById(currentHelperId).name}
              rosaStatus={rosaStatus}
              ledger={ledger}
              ledgerDefault={ledgerDefault}
              onSetLedgerDefault={setLedgerDefault}
              onUpdateLedgerEntry={updateLedgerEntry}
              pantry={pantry}
              schedules={schedules}
              invites={invites}
              onAddInvite={addInvite}
              onRemoveInvite={removeInvite}
              onResolveFlag={resolveInviteFlag}
            />
          ) : (
            <HelperView
              tasks={tasks}
              helper={helperById(currentHelperId)}
              vales={vales.filter((v) => v.helperId === currentHelperId)}
              boardClosed={boardClosed}
              onUpdate={updateStatus}
              onBlock={blockTask}
              onRequestVale={(amount, reason) => requestVale(currentHelperId, amount, reason)}
              utosList={utosList}
              onAckUtos={ackUtos}
              utosWipedToday={utosWipedToday}
              rosaStatus={rosaStatus}
              onSetRosaAvailable={setRosaAvailable}
              onSetRosaOff={setRosaOff}
              ledger={ledger}
              ledgerDefault={ledgerDefault}
              onUpdateLedgerEntry={updateLedgerEntry}
              pantry={pantry}
              weekSchedule={schedules.weekFor(currentHelperId)}
              simDate={simDate}
              onAddTask={(t) => addTask(t)}
              invites={invites}
              onFindInvite={findInviteByCode}
              onClaimInvite={claimInvite}
              onFlagInvite={flagInvite}
            />
          )}
        </main>
      </GroceryProvider>
    </div>
  );
}

// ---------- Top bar ----------
function TopBar({
  viewAs,
  onViewAsChange,
  admins,
  adminType,
  boardClosed,
  onBoardClosedChange,
  nowTs,
  simOffsetMs,
  onSimOffsetChange,
}: {
  viewAs: ViewAs;
  onViewAsChange: (v: ViewAs) => void;
  admins: Admin[];
  adminType: AdminType | null;
  boardClosed: boolean;
  onBoardClosedChange: (closed: boolean) => void;
  nowTs: number;
  simOffsetMs: number | null;
  onSimOffsetChange: (v: number | null) => void;
}) {
  const canEndDay = adminType === "primary" || adminType === "co";
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-2xl font-semibold leading-none tracking-tight text-primary">
              linara
            </div>
            <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
              Home, made clear.
            </div>
          </div>
        </div>
        <ViewAsSwitcher viewAs={viewAs} onChange={onViewAsChange} admins={admins} />
        <SimClock nowTs={nowTs} offsetMs={simOffsetMs} onChange={onSimOffsetChange} />
        {canEndDay && <EndOfDayToggle closed={boardClosed} onChange={onBoardClosedChange} />}
      </div>
    </header>
  );
}

function EndOfDayToggle({ closed, onChange }: { closed: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!closed)}
      role="switch"
      aria-checked={closed}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-soft transition sm:text-xs ${
        closed
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground"
      }`}
    >
      <Moon className="h-3.5 w-3.5" />
      <span className="whitespace-nowrap">Simulate end of day</span>
      <span
        className={`relative h-4 w-7 rounded-full transition ${closed ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-card shadow transition-all ${closed ? "left-3.5" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

function ViewAsSwitcher({
  viewAs,
  onChange,
  admins,
}: {
  viewAs: ViewAs;
  onChange: (v: ViewAs) => void;
  admins: Admin[];
}) {
  const options: Array<{ key: ViewAs; label: string; sub: string }> = [
    ...admins.map((a) => ({ key: a.id as ViewAs, label: a.short, sub: adminTypeShort[a.type] })),
    { key: "rosa", label: "Rosa", sub: "Helper" },
  ];
  return (
    <div className="inline-flex shrink-0 flex-col items-start gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        View as
      </div>
      <div className="inline-flex rounded-full border border-border bg-card p-1 shadow-soft">
        {options.map((opt) => {
          const active = viewAs === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => onChange(opt.key)}
              className={`flex flex-col items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-tight transition sm:px-3 sm:text-xs ${
                active
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{opt.label}</span>
              <span
                className={`text-[9px] font-medium ${active ? "text-primary-foreground/80" : "text-muted-foreground/70"}`}
              >
                {opt.sub}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Manager view ----------
function ManagerView({
  admins,
  adminType,
  currentAdmin,
  onUpdateAdminType,
  tasks,
  vales,
  routines,
  appointments,
  simDate,
  onAdd,
  onApproveSuggestion,
  onDismissSuggestion,
  onReschedule,
  onDecideVale,
  onAddRoutine,
  onRemoveRoutine,
  onStartNewDay,
  onSendUtos,
  boardClosed,
  helperName,
  rosaStatus,
  ledger,
  ledgerDefault,
  onSetLedgerDefault,
  onUpdateLedgerEntry,
  pantry,
  schedules,
  invites,
  onAddInvite,
  onRemoveInvite,
  onResolveFlag,
}: {
  admins: Admin[];
  adminType: AdminType | null;
  currentAdmin: Admin | null;
  onUpdateAdminType: (id: string, type: AdminType) => void;
  tasks: Task[];
  vales: ValeRequest[];
  routines: Routine[];
  appointments: AppointmentStore;
  simDate: Date;
  onAdd: (
    t: Omit<Task, "id" | "status" | "station">,
    flags?: {
      afterHours?: boolean;
      emergency?: boolean;
      queuedForShift?: boolean;
      suggested?: boolean;
    },
  ) => void;
  onApproveSuggestion: (id: string) => void;
  onDismissSuggestion: (id: string) => void;
  onReschedule: (id: string) => void;
  onDecideVale: (id: string, decision: "approved" | "declined") => void;
  onAddRoutine: (r: Omit<Routine, "id" | "station">) => void;
  onRemoveRoutine: (id: string) => void;
  onStartNewDay: () => void;
  onSendUtos: (
    content: string,
    flags?: { afterHours?: boolean; emergency?: boolean; waiting?: boolean; from?: string },
  ) => void;
  boardClosed: boolean;
  helperName: string;
  rosaStatus: RosaStatus;
  ledger: LedgerEntry[];
  ledgerDefault: LedgerResolution;
  onSetLedgerDefault: (r: LedgerResolution) => void;
  onUpdateLedgerEntry: (
    id: string,
    patch: Partial<Pick<LedgerEntry, "adjustMinutes" | "resolution">>,
  ) => void;
  pantry: PantryStore;
  schedules: ScheduleStore;
  invites: Invite[];
  onAddInvite: (
    data: Omit<Invite, "id" | "code" | "createdAt" | "createdBy" | "status" | "flags">,
    byName: string,
  ) => Invite;
  onRemoveInvite: (id: string) => void;
  onResolveFlag: (inviteId: string, flagId: string) => void;
}) {
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
          onInvite={(data) => onAddInvite(data, authorName)}
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

// ---------- Shifts (weekly schedule per helper) ----------
// ---------- People (household admins + helpers) ----------
function PeopleSection({
  admins,
  currentAdmin,
  canEditAdmins,
  onUpdateAdminType,
  schedules,
  invites,
  canInvite,
  onInvite,
  onCancelInvite,
}: {
  admins: Admin[];
  currentAdmin: Admin | null;
  canEditAdmins: boolean;
  onUpdateAdminType: (id: string, type: AdminType) => void;
  schedules: Record<string, WeekSchedule>;
  invites: Invite[];
  canInvite: boolean;
  onInvite: (
    data: Omit<Invite, "id" | "code" | "createdAt" | "createdBy" | "status" | "flags">,
  ) => Invite;
  onCancelInvite: (id: string) => void;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [issued, setIssued] = useState<Invite | null>(null);
  return (
    <div className="space-y-6 pb-4">
      <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-foreground">Admins</h2>
            <p className="text-xs text-muted-foreground">
              The grown-ups who run the house.{" "}
              {canEditAdmins
                ? "As Primary, you can change roles."
                : "Only the Primary can change roles."}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep">
            <Users className="h-3 w-3" /> {admins.length}
          </span>
        </div>
        <div className="space-y-3">
          {admins.map((a) => {
            const isYou = currentAdmin?.id === a.id;
            return (
              <div
                key={a.id}
                className="flex flex-wrap items-start gap-3 rounded-2xl border border-border/70 bg-background/40 p-3.5"
              >
                <Avatar initials={a.initials} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{a.name}</span>
                    {isYou && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        You
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        a.type === "primary"
                          ? "bg-primary/10 text-primary"
                          : a.type === "co"
                            ? "bg-secondary text-pine-deep"
                            : "bg-terracotta-soft/60 text-[oklch(0.38_0.09_60)]"
                      }`}
                    >
                      {adminTypeLabel[a.type]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{a.location}</div>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    {adminPermSummary[a.type]}
                  </div>
                </div>
                {canEditAdmins && (
                  <div className="shrink-0">
                    <label className="sr-only" htmlFor={`role-${a.id}`}>
                      Role for {a.name}
                    </label>
                    <select
                      id={`role-${a.id}`}
                      value={a.type}
                      onChange={(e) => onUpdateAdminType(a.id, e.target.value as AdminType)}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground outline-none focus:border-primary"
                    >
                      <option value="primary">Primary manager</option>
                      <option value="co">Co-manager</option>
                      <option value="remote">Remote admin</option>
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-[11px] italic text-muted-foreground">
          Roles are mock data — changes stay on this device.
        </p>
      </section>

      <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl text-foreground">Helpers</h2>
            <p className="text-xs text-muted-foreground">Your household team, by station.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep">
            <Users className="h-3 w-3" /> {HELPERS.length + invites.length}
          </span>
        </div>

        {canInvite && (
          <button
            onClick={() => setInviteOpen(true)}
            className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" /> Invite a helper
          </button>
        )}

        <div className="space-y-3">
          {HELPERS.map((h) => {
            const wk = schedules[h.id];
            const restLabel = wk
              ? WEEKDAYS.filter((d) => wk[d].rest)
                  .map((d) => WEEKDAY_LONG[d])
                  .join(", ") || "None"
              : h.restDay;
            return (
              <div
                key={h.id}
                className="flex items-start gap-3 rounded-2xl border border-border/70 bg-background/40 p-3.5"
              >
                <Avatar initials={h.initials} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{h.name}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-pine-deep">
                      {h.station}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">Shift: {h.shift}</div>
                  <div className="text-[11px] text-muted-foreground">Rest: {restLabel}</div>
                </div>
              </div>
            );
          })}

          {invites.map((inv) => {
            const displayName = inv.claimedName || inv.name;
            const initials =
              displayName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((s) => s[0]?.toUpperCase() ?? "")
                .join("") || "??";
            const isActive = inv.status === "active";
            return (
              <div
                key={inv.id}
                className={`flex flex-wrap items-start gap-3 rounded-2xl p-3.5 ${
                  isActive
                    ? "border border-border/70 bg-background/40"
                    : "border border-dashed border-terracotta/50 bg-terracotta-soft/30"
                }`}
              >
                <Avatar initials={initials} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{displayName}</span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-pine-deep">
                      {inv.station}
                    </span>
                    {isActive ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-terracotta/20 px-2 py-0.5 text-[10px] font-semibold text-[oklch(0.38_0.09_60)]">
                        Invited — pending
                      </span>
                    )}
                    {inv.flags.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-2 py-0.5 text-[10px] font-semibold text-[oklch(0.38_0.09_60)]">
                        <AlertCircle className="h-2.5 w-2.5" /> {inv.flags.length} flag
                        {inv.flags.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {inv.employment === "live-in" ? "Live-in" : "Live-out"} · {inv.shift} · Rest:{" "}
                    {inv.restDay}
                  </div>
                  {!isActive ? (
                    <div className="text-[11px] text-muted-foreground">
                      Code:{" "}
                      <span className="font-mono font-semibold text-foreground">{inv.code}</span> ·
                      invited by {inv.createdBy}
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground">
                      Claimed her own account · joined via {inv.createdBy}
                    </div>
                  )}
                  {inv.flags.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-[11px] text-[oklch(0.38_0.09_60)]">
                      {inv.flags.map((f) => (
                        <li key={f.id}>
                          Flagged: <span className="font-semibold">{f.field}</span>
                          {f.note ? ` — "${f.note}"` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {!isActive && (
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <button
                      onClick={() => setIssued(inv)}
                      className="rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-foreground hover:border-primary"
                    >
                      Show code
                    </button>
                    {canInvite && (
                      <button
                        onClick={() => onCancelInvite(inv.id)}
                        className="rounded-full px-3 py-1 text-[11px] font-semibold text-muted-foreground hover:text-destructive"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[11px] italic text-muted-foreground">
          You're entering the household's record and sending an invite — you're not creating her
          login. She'll set up and control her own account, and her record stays hers.
        </p>
      </section>

      {inviteOpen && (
        <InviteHelperModal
          onClose={() => setInviteOpen(false)}
          onSubmit={(data) => {
            const inv = onInvite(data);
            setInviteOpen(false);
            setIssued(inv);
          }}
        />
      )}
      {issued && <InviteCodeScreen invite={issued} onClose={() => setIssued(null)} />}
    </div>
  );
}

function InviteHelperModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (
    data: Omit<Invite, "id" | "code" | "createdAt" | "createdBy" | "status" | "flags">,
  ) => void;
}) {
  const [name, setName] = useState("");
  const [station, setStation] = useState<Station>("Yaya");
  const [employment, setEmployment] = useState<Employment>("live-in");
  const [shift, setShift] = useState("6:00 AM – 7:00 PM");
  const [restDay, setRestDay] = useState("Sunday");
  const [wage, setWage] = useState("8000");
  const [phone, setPhone] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      station,
      employment,
      shift: shift.trim() || "—",
      restDay: restDay.trim() || "—",
      wagePHP: parseInt(wage, 10) || 0,
      phone: phone.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl text-foreground">Invite a helper</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              You're entering the household's record of the arrangement — not creating her account.
              She'll claim it herself with the invite code.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Full name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ate Marites"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Station / role">
              <select
                value={station}
                onChange={(e) => setStation(e.target.value as Station)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="Yaya">Yaya</option>
                <option value="Cook">Cook</option>
                <option value="Driver">Driver</option>
                <option value="House">All-around</option>
              </select>
            </Field>
            <Field label="Employment">
              <select
                value={employment}
                onChange={(e) => setEmployment(e.target.value as Employment)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="live-in">Live-in</option>
                <option value="live-out">Live-out</option>
              </select>
            </Field>
          </div>
          <Field label="Shift hours">
            <input
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              placeholder="e.g. 6:00 AM – 7:00 PM"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rest day">
              <input
                value={restDay}
                onChange={(e) => setRestDay(e.target.value)}
                placeholder="e.g. Sunday"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="Monthly wage (₱)">
              <input
                inputMode="numeric"
                value={wage}
                onChange={(e) => setWage(e.target.value.replace(/\D/g, ""))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
          <Field label="Contact number">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0917 555 1234"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!name.trim()}
            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
          >
            Generate invite code
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteCodeScreen({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Invite created
            </div>
            <h3 className="mt-1 font-display text-2xl text-foreground">
              Share this code with {invite.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 rounded-3xl border border-dashed border-primary/40 bg-primary/5 px-5 py-6 text-center">
          <div className="font-display text-4xl font-semibold tracking-[0.15em] text-primary">
            {invite.code}
          </div>
          <button
            onClick={copy}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold text-foreground hover:border-primary"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" /> Copied
              </>
            ) : (
              <>
                <Link2 className="h-3 w-3" /> Copy code
              </>
            )}
          </button>
        </div>

        <div className="mt-5 space-y-2 rounded-2xl bg-background/60 p-4 text-xs text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">{invite.station}</span> ·{" "}
            {invite.employment === "live-in" ? "Live-in" : "Live-out"}
          </div>
          <div>Shift: {invite.shift}</div>
          <div>Rest day: {invite.restDay}</div>
          <div>Wage: ₱{invite.wagePHP.toLocaleString()} / month</div>
          {invite.phone && <div>Contact: {invite.phone}</div>}
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          She'll set up and control her own account with this code — her record stays hers. Until
          then she'll appear as{" "}
          <span className="font-semibold text-foreground">Invited — pending</span> in your People
          list.
        </p>

        <div className="mt-5 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ClaimAccountFlow({
  onClose,
  onFindInvite,
  onClaim,
  onFlag,
  onFinished,
}: {
  onClose: () => void;
  onFindInvite: (code: string) => Invite | null;
  onClaim: (id: string, claimedName: string) => void;
  onFlag: (id: string, field: string, note?: string) => void;
  onFinished: (inv: Invite) => void;
}) {
  const [step, setStep] = useState<"code" | "review" | "setup" | "flag">("code");
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [flagField, setFlagField] = useState("Shift hours");
  const [flagNote, setFlagNote] = useState("");
  const [flagged, setFlagged] = useState(false);

  const submitCode = () => {
    const found = onFindInvite(codeInput);
    if (!found) {
      setCodeError("Hindi namin nakita 'yang code. Check the letters and numbers, tapos try ulit.");
      return;
    }
    setInvite(found);
    setDisplayName(found.name);
    setCodeError(null);
    setStep("review");
  };

  const submitClaim = () => {
    if (!invite) return;
    if (!displayName.trim()) return;
    if (pin.length < 4 || pin !== pin2) return;
    onClaim(invite.id, displayName.trim());
    onFinished({ ...invite, status: "active", claimedName: displayName.trim() });
  };

  const submitFlag = () => {
    if (!invite) return;
    onFlag(invite.id, flagField, flagNote.trim() || undefined);
    setFlagged(true);
    setStep("review");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-lift">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
              {step === "code"
                ? "Step 1 of 3"
                : step === "review"
                  ? "Step 2 of 3"
                  : step === "setup"
                    ? "Step 3 of 3"
                    : "Flag a detail"}
            </div>
            <h3 className="mt-1 font-display text-2xl leading-tight text-foreground">
              {step === "code" && "Claim your account"}
              {step === "review" && "Tingnan mo muna — ito ba ang usapan?"}
              {step === "setup" && "This account is yours."}
              {step === "flag" && "Something's not right?"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "code" && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              I-enter mo 'yung invite code galing sa employer mo. Mukhang{" "}
              <span className="font-mono font-semibold text-foreground">LINARA-1234</span>.
            </p>
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="claim-code"
              >
                Invite code
              </label>
              <input
                id="claim-code"
                autoFocus
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value.toUpperCase());
                  setCodeError(null);
                }}
                placeholder="LINARA-1234"
                className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-4 text-center font-mono text-xl tracking-[0.2em] text-foreground outline-none focus:border-primary"
              />
              {codeError && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-[oklch(0.38_0.09_60)]">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {codeError}
                </p>
              )}
            </div>
            <button
              onClick={submitCode}
              disabled={!codeInput.trim()}
              className="w-full rounded-full bg-primary px-4 py-3.5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        )}

        {step === "review" && invite && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Ito 'yung inilagay ng employer mo sa household record. Basahin muna — hindi ka
              pumapasok sa black box.
            </p>
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/60 p-4 text-sm">
              <ReviewRow label="Pangalan" value={invite.name} />
              <ReviewRow label="Role / station" value={invite.station} />
              <ReviewRow
                label="Employment"
                value={invite.employment === "live-in" ? "Live-in" : "Live-out"}
              />
              <ReviewRow label="Shift" value={invite.shift} />
              <ReviewRow label="Rest day" value={invite.restDay} />
              <ReviewRow label="Monthly wage" value={`₱${invite.wagePHP.toLocaleString()}`} />
            </div>
            {flagged && (
              <div className="flex items-start gap-2 rounded-2xl border border-terracotta/50 bg-terracotta-soft/40 px-3 py-2.5 text-xs text-[oklch(0.38_0.09_60)]">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Salamat — sinabi na namin sa manager mo. Pwede ka pa ring mag-continue, o
                  mag-antay muna ng ayos.
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setStep("flag")}
              className="w-full text-left text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
            >
              Something's not right? →
            </button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setStep("code")}
                className="rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <button
                onClick={() => setStep("setup")}
                className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
              >
                Looks right — continue
              </button>
            </div>
          </div>
        )}

        {step === "flag" && invite && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Alin ang mali? Sabihin mo lang — ipapaalam namin sa manager. Hindi mo pa kailangang
              pumirma.
            </p>
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="flag-field"
              >
                Which detail?
              </label>
              <select
                id="flag-field"
                value={flagField}
                onChange={(e) => setFlagField(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-primary"
              >
                <option>Pangalan</option>
                <option>Role / station</option>
                <option>Employment</option>
                <option>Shift hours</option>
                <option>Rest day</option>
                <option>Monthly wage</option>
                <option>Iba pa</option>
              </select>
            </div>
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="flag-note"
              >
                Note (optional)
              </label>
              <textarea
                id="flag-note"
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                rows={3}
                placeholder="e.g. Ang usapan namin ay 7 AM – 6 PM, hindi 6 AM – 7 PM."
                className="mt-1.5 w-full resize-none rounded-2xl border border-input bg-background px-3 py-3 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setStep("review")}
                className="rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={submitFlag}
                className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
              >
                Send flag to manager
              </button>
            </div>
          </div>
        )}

        {step === "setup" && invite && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-primary/5 p-4 text-sm leading-relaxed text-foreground">
              This account is <span className="font-semibold text-primary">yours</span>. Your record
              stays with you, even if you change households.
            </div>
            <div>
              <label
                className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                htmlFor="claim-name"
              >
                Your name (paano mo gustong tawagin)
              </label>
              <input
                id="claim-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  htmlFor="claim-pin"
                >
                  4-digit PIN
                </label>
                <input
                  id="claim-pin"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary"
                />
              </div>
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  htmlFor="claim-pin2"
                >
                  Ulitin
                </label>
                <input
                  id="claim-pin2"
                  inputMode="numeric"
                  maxLength={6}
                  value={pin2}
                  onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  className="mt-1.5 w-full rounded-2xl border border-input bg-background px-4 py-3 text-center font-mono text-lg tracking-[0.3em] outline-none focus:border-primary"
                />
              </div>
            </div>
            {pin.length >= 4 && pin !== pin2 && pin2.length >= pin.length && (
              <p className="text-xs text-[oklch(0.38_0.09_60)]">
                Hindi magkatugma 'yung PIN. Try again.
              </p>
            )}
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              PIN lang muna para sa prototype — hindi ito ipinapadala kahit kanino.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => setStep("review")}
                className="rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                Back
              </button>
              <button
                onClick={submitClaim}
                disabled={!displayName.trim() || pin.length < 4 || pin !== pin2}
                className="flex-1 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 disabled:opacity-50"
              >
                Claim my account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ClaimedWelcome({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 text-center shadow-lift">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Check className="h-6 w-6" />
        </div>
        <h3 className="mt-4 font-display text-2xl text-foreground">
          Welcome, {invite.claimedName || invite.name}.
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Ito na 'yung Station mo. Nandito lahat ng gagawin ngayon — at ang record mo, sa'yo pa rin,
          kahit saan ka magtrabaho.
        </p>
        <button
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90"
        >
          Go to my Station
        </button>
      </div>
    </div>
  );
}

function NeedsYou({
  blocked,
  pendingVales,
  onReschedule,
  onDecideVale,
  flaggedInvites,
  onResolveFlag,
}: {
  blocked: Task[];
  pendingVales: ValeRequest[];
  onReschedule: (id: string) => void;
  onDecideVale: (id: string, decision: "approved" | "declined") => void;
  flaggedInvites: Invite[];
  onResolveFlag: (inviteId: string, flagId: string) => void;
}) {
  const [replyId, setReplyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const flagsCount = flaggedInvites.reduce((s, i) => s + i.flags.length, 0);
  const total = blocked.length + pendingVales.length + flagsCount;

  if (total === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-border bg-card/40 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep">
            <Check className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Needs you</div>
            <div className="text-xs text-muted-foreground">All clear — no one is stuck.</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-terracotta/40 bg-terracotta-soft/40 p-4 shadow-soft sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-foreground">
          <AlertCircle className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">Needs you · {total}</div>
          <div className="text-xs text-muted-foreground">
            Blocked tasks, vale requests, and flagged details.
          </div>
        </div>
      </div>
      <div className="space-y-2.5">
        {blocked.map((t) => {
          const helper = helperById(t.helperId);
          const isReplying = replyId === t.id;
          return (
            <div
              key={t.id}
              className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Avatar initials={helper.initials} />
                    <span className="text-xs font-semibold text-foreground">{helper.short}</span>
                    <span className="text-[11px] text-muted-foreground">· {t.time}</span>
                  </div>
                  <h4 className="mt-1.5 text-sm font-semibold text-foreground">{t.title}</h4>
                  <p className="mt-1 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
                    "{t.blockReason}"
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stationTone[t.station]}`}
                >
                  {t.station}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setReplyId(isReplying ? null : t.id)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Reply
                </button>
                <button
                  onClick={() => {
                    onReschedule(t.id);
                    setReplyId(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reschedule
                </button>
              </div>
              {isReplying && (
                <div className="mt-3 rounded-xl border border-border bg-background p-2">
                  <textarea
                    value={drafts[t.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                    rows={2}
                    placeholder={`Message ${helper.short}…`}
                    className="w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
                  />
                  <div className="mt-1 flex items-center justify-between px-1">
                    <span className="text-[10px] text-muted-foreground">Mock only · not sent</span>
                    <button
                      onClick={() => setReplyId(null)}
                      className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {pendingVales.map((v) => {
          const helper = helperById(v.helperId);
          return (
            <div
              key={v.id}
              className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Avatar initials={helper.initials} />
                    <span className="text-xs font-semibold text-foreground">{helper.short}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                      <Coins className="h-3 w-3" /> Vale request
                    </span>
                  </div>
                  <h4 className="mt-1.5 font-display text-lg text-foreground">
                    ₱{v.amount.toLocaleString()}
                  </h4>
                  <p className="mt-1 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
                    "{v.reason}"
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onDecideVale(v.id, "approved")}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                >
                  <Check className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  onClick={() => onDecideVale(v.id, "declined")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" /> Decline
                </button>
              </div>
            </div>
          );
        })}
        {flaggedInvites.map((inv) =>
          inv.flags.map((f) => {
            const displayName = inv.claimedName || inv.name;
            const initials =
              displayName
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((s) => s[0]?.toUpperCase() ?? "")
                .join("") || "??";
            return (
              <div
                key={f.id}
                className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Avatar initials={initials} />
                      <span className="text-xs font-semibold text-foreground">{displayName}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-terracotta/20 px-2 py-0.5 text-[10px] font-semibold text-[oklch(0.38_0.09_60)]">
                        <AlertCircle className="h-3 w-3" /> Flagged a detail
                      </span>
                    </div>
                    <h4 className="mt-1.5 text-sm font-semibold text-foreground">{f.field}</h4>
                    {f.note && (
                      <p className="mt-1 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
                        "{f.note}"
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Raised during claim · code {inv.code}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onResolveFlag(inv.id, f.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                  >
                    <Check className="h-3.5 w-3.5" /> Mark resolved
                  </button>
                  <span className="text-[11px] text-muted-foreground">
                    Update the household record in People → invite.
                  </span>
                </div>
              </div>
            );
          }),
        )}
      </div>
    </section>
  );
}

// ---------- Helper view ----------

function HelperView({
  tasks,
  helper,
  vales,
  boardClosed,
  onUpdate,
  onBlock,
  onRequestVale,
  utosList,
  onAckUtos,
  utosWipedToday,
  rosaStatus,
  onSetRosaAvailable,
  onSetRosaOff,
  ledger,
  ledgerDefault,
  onUpdateLedgerEntry,
  pantry,
  weekSchedule,
  simDate,
  onAddTask,
  invites,
  onFindInvite,
  onClaimInvite,
  onFlagInvite,
}: {
  tasks: Task[];
  helper: Helper;
  vales: ValeRequest[];
  boardClosed: boolean;
  onUpdate: (id: string, s: Status, photo?: string) => void;
  onBlock: (id: string, reason: string) => void;
  onRequestVale: (amount: number, reason: string) => void;
  utosList: QuickUtos[];
  onAckUtos: (id: string, ack: "seen" | "done") => void;
  utosWipedToday: boolean;
  rosaStatus: RosaStatus;
  onSetRosaAvailable: (hours: number) => void;
  onSetRosaOff: () => void;
  ledger: LedgerEntry[];
  ledgerDefault: LedgerResolution;
  onUpdateLedgerEntry: (
    id: string,
    patch: Partial<Pick<LedgerEntry, "adjustMinutes" | "resolution">>,
  ) => void;
  pantry: PantryStore;
  weekSchedule: WeekSchedule;
  simDate: Date;
  onAddTask: (t: Omit<Task, "id" | "status" | "station">) => void;
  invites: Invite[];
  onFindInvite: (code: string) => Invite | null;
  onClaimInvite: (id: string, claimedName: string) => void;
  onFlagInvite: (id: string, field: string, note?: string) => void;
}) {
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
          onAvailable={onSetRosaAvailable}
          onOff={onSetRosaOff}
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

function EndOfDay({ doneCount }: { doneCount: number }) {
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-8 text-center shadow-lift">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
        <Check className="h-6 w-6" />
      </div>
      <h2 className="mt-4 font-display text-2xl text-foreground">
        Great work today — {doneCount} of {doneCount} done
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">Salamat po, Ate Rosa. Rest well.</p>
      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-2 text-sm font-medium text-pine-deep">
        <Moon className="h-4 w-4" /> The board is closed for the night
      </div>
    </section>
  );
}

function MyTerms({ helper, invite }: { helper: Helper; invite: Invite | null }) {
  const [open, setOpen] = useState(false);
  const employment = invite?.employment
    ? invite.employment === "live-in"
      ? "Live-in"
      : "Live-out"
    : "—";
  const role = invite?.station ?? helper.station;
  const shift = invite?.shift ?? helper.shift;
  const restDay = invite?.restDay ?? helper.restDay;
  const wage = invite?.wagePHP ? `₱${invite.wagePHP.toLocaleString()} / month` : "Not on file yet";
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            On file with this household
          </div>
          <div className="mt-1 font-display text-lg text-foreground">
            Your terms — as the employer entered them
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Read-only. Tap to {open ? "hide" : "review"} any time.
          </p>
        </div>
        <span className="mt-1 shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          {open ? "Hide" : "Review"}
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-2 rounded-2xl bg-background/60 p-4 text-sm">
          <ReviewRow label="Pangalan" value={invite?.name ?? helper.name} />
          <ReviewRow label="Role / station" value={role} />
          <ReviewRow label="Employment" value={employment} />
          <ReviewRow label="Shift" value={shift} />
          <ReviewRow label="Rest day" value={restDay} />
          <ReviewRow label="Monthly wage" value={wage} />
          {invite?.phone && <ReviewRow label="Contact on file" value={invite.phone} />}
          <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
            May mali? Sabihin mo sa manager mo — huwag muna pumirma kung hindi tugma sa usapan.
          </p>
        </div>
      )}
    </section>
  );
}

function PayRecord({
  vales,
  onRequestVale,
  ledger,
  ledgerDefault,
  onUpdateLedgerEntry,
  helper,
  myInvite,
}: {
  vales: ValeRequest[];
  onRequestVale: (amount: number, reason: string) => void;
  ledger: LedgerEntry[];
  ledgerDefault: LedgerResolution;
  onUpdateLedgerEntry: (
    id: string,
    patch: Partial<Pick<LedgerEntry, "adjustMinutes" | "resolution">>,
  ) => void;
  helper: Helper;
  myInvite: Invite | null;
}) {
  const [asking, setAsking] = useState(false);
  const approvedTotal = vales
    .filter((v) => v.status === "approved")
    .reduce((s, v) => s + v.amount, 0);
  const pending = vales.filter((v) => v.status === "pending");
  const declined = vales.filter((v) => v.status === "declined");
  const baselineVale = 1500;
  const totalVale = baselineVale + approvedTotal;
  const limit = 3000;
  const pct = Math.min(100, Math.round((totalVale / limit) * 100));

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-primary/25 bg-primary/5 p-4 shadow-soft">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">This record is yours.</div>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              It stays with you if you leave this household — your hours, your rest owed, your
              history.
            </p>
          </div>
        </div>
      </section>

      <MyTerms helper={helper} invite={myInvite} />

      <AfterHoursLedger
        entries={ledger}
        ledgerDefault={ledgerDefault}
        onUpdateEntry={onUpdateLedgerEntry}
        audience="helper"
      />
      <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-soft">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Current cutoff · Jun 1 – Jun 15
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <div className="font-display text-3xl text-foreground">₱9,240</div>
          <span className="text-xs font-semibold text-primary">Expected payout</span>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <Row label="Base salary (half-month)" value="₱8,000" />
          <Row label="Overtime · 4 hrs" value="₱480" />
          <Row label="SSS / PhilHealth share" value="− ₱240" muted />
          <Row label="Meal + transport allowance" value="₱1,000" />
        </div>
      </section>

      {approvedTotal > 0 && (
        <section className="rounded-3xl border border-primary/30 bg-primary/5 p-5 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                Vale balance
              </div>
              <div className="mt-1 font-display text-3xl text-primary">
                ₱{approvedTotal.toLocaleString()}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Approved by Ma'am · added this cutoff
              </div>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <Check className="h-5 w-5" />
            </div>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Vale (cash advance)
            </div>
            <div className="mt-1 font-display text-2xl text-foreground">
              ₱{totalVale.toLocaleString()}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                / ₱{limit.toLocaleString()} limit
              </span>
            </div>
          </div>
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/20 text-accent-foreground">
            <Wallet className="h-5 w-5" />
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Deducted equally over the next 3 cutoffs. You can view every entry on your record.
        </p>

        <button
          onClick={() => setAsking(true)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep sm:w-auto"
        >
          <Coins className="h-4 w-4" /> Request cash advance (vale)
        </button>

        {(pending.length > 0 || declined.length > 0) && (
          <div className="mt-4 space-y-1.5">
            {pending.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-foreground">
                    ₱{v.amount.toLocaleString()}
                  </span>
                  <span className="ml-2 text-muted-foreground">"{v.reason}"</span>
                </div>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-pine-deep">
                  Waiting
                </span>
              </div>
            ))}
            {declined.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-xl border border-dashed border-border px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-semibold text-foreground">
                    ₱{v.amount.toLocaleString()}
                  </span>
                  <span className="ml-2 text-muted-foreground">"{v.reason}"</span>
                </div>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  Declined
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {asking && (
        <ValeRequestModal
          onClose={() => setAsking(false)}
          onSubmit={(amt, r) => {
            onRequestVale(amt, r);
            setAsking(false);
          }}
        />
      )}
    </div>
  );
}

function ValeRequestModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (amount: number, reason: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const amt = Number(amount);
  const valid = amt > 0 && reason.trim().length > 0;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl text-foreground">Request cash advance</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Ma'am will see it in her "Needs you" list.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Amount (₱)">
            <div className="flex items-center rounded-xl border border-input bg-background px-3 py-2.5 focus-within:border-primary">
              <span className="mr-1 text-sm font-semibold text-muted-foreground">₱</span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="1000"
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
          </Field>
          <Field label="Reason">
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Tuition balance for my daughter"
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => valid && onSubmit(amt, reason.trim())}
            disabled={!valid}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
          >
            Send request
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickUtosLauncher({
  onSend,
  helperName,
}: {
  onSend: (content: string) => void;
  helperName: string;
}) {
  const [draft, setDraft] = useState("");
  const [holding, setHolding] = useState(false);

  const sendCustom = () => {
    const v = draft.trim();
    if (!v) return;
    onSend(v);
    setDraft("");
  };

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6">
      <div>
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Zap className="h-3.5 w-3.5 text-accent" /> Quick utos
        </div>
        <div className="mt-1 font-display text-lg text-foreground">
          Send a small ask to {helperName}
        </div>
      </div>

      {/* Preset chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK_UTOS_PRESETS.map((preset) => (
          <button
            key={preset}
            onClick={() => onSend(preset)}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground shadow-soft transition hover:border-primary/40 hover:bg-secondary"
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Custom one-liner */}
      <div className="mt-4 flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 shadow-soft focus-within:border-primary/50">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendCustom();
          }}
          placeholder="Type a quick utos…"
          className="flex-1 bg-transparent py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          onClick={sendCustom}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> Send
        </button>
      </div>

      {/* Voice utos */}
      <div className="mt-3">
        <button
          onMouseDown={() => setHolding(true)}
          onTouchStart={() => setHolding(true)}
          onMouseUp={() => {
            if (holding) {
              onSend("🎙️ Voice utos · 0:04");
              setHolding(false);
            }
          }}
          onMouseLeave={() => {
            if (holding) {
              onSend("🎙️ Voice utos · 0:04");
              setHolding(false);
            }
          }}
          onTouchEnd={() => {
            if (holding) {
              onSend("🎙️ Voice utos · 0:04");
              setHolding(false);
            }
          }}
          className={`inline-flex w-full items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-soft transition ${
            holding
              ? "border-accent bg-accent text-accent-foreground"
              : "border-border bg-background text-foreground hover:border-accent/50"
          }`}
        >
          <Mic className="h-4 w-4" />{" "}
          {holding ? "Recording… release to send" : "Hold to record a voice utos"}
        </button>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Need it tracked, timed, or done a certain way? Use New task instead.
      </p>
    </section>
  );
}

function QuickUtosFeed({
  utosList,
  onAck,
  available,
  wiped,
}: {
  utosList: QuickUtos[];
  onAck: (id: string, ack: "seen" | "done") => void;
  available: boolean;
  wiped: boolean;
}) {
  const ordered = [...utosList].sort((a, b) => b.timestamp - a.timestamp);
  const isEmptyAfterWipe = utosList.length === 0 && wiped;

  return (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        Today's quick utos
      </h3>

      {isEmptyAfterWipe ? (
        <div className="rounded-2xl border border-dashed border-border/70 bg-muted/40 p-4 text-center">
          <div className="text-sm font-semibold text-foreground">Today's list was deleted 🌙</div>
          <p className="mt-1 text-xs text-muted-foreground">
            The individual utos are gone, not hidden. Tomorrow starts clean.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {ordered.map((u) => (
            <UtosChip key={u.id} utos={u} onAck={onAck} available={available} />
          ))}
        </ul>
      )}
    </section>
  );
}

function UtosChip({
  utos,
  onAck,
  available,
}: {
  utos: QuickUtos;
  onAck: (id: string, ack: "seen" | "done") => void;
  available: boolean;
}) {
  const acked = utos.ackState === "seen" || utos.ackState === "done";
  const waiting = (!available || utos.waiting) && !acked;

  const accent = utos.emergency
    ? "border-l-[oklch(0.55_0.2_30)]"
    : waiting
      ? "border-l-muted-foreground/30"
      : acked
        ? "border-l-primary"
        : "border-l-accent";
  const bg = waiting ? "bg-muted/40" : "bg-card";
  const textTone = waiting ? "text-muted-foreground" : "text-foreground";

  return (
    <li
      className={`flex flex-col gap-2 rounded-2xl border border-border/70 ${bg} p-3 pl-3.5 shadow-soft border-l-4 ${accent}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`truncate text-sm font-semibold ${textTone}`}>{utos.content}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>
              {formatTimeOfDay(utos.timestamp)} · from {utos.from}
            </span>
            {utos.emergency && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[oklch(0.95_0.06_35)] px-1.5 py-0.5 text-[10px] font-semibold text-[oklch(0.42_0.15_30)]">
                <AlertCircle className="h-2.5 w-2.5" /> Emergency
              </span>
            )}
            {utos.afterHours && !utos.emergency && (
              <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-1.5 py-0.5 text-[10px] font-semibold text-[oklch(0.38_0.09_60)]">
                After-hours
              </span>
            )}
          </div>
        </div>
        {acked ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Check className="h-3 w-3" /> {utos.ackState === "done" ? "Done" : "Got it"}
          </span>
        ) : null}
      </div>

      {waiting ? (
        <p className="text-[11px] italic text-muted-foreground">
          Waiting — Rosa is off. She'll see it when she's back.
        </p>
      ) : !acked ? (
        <div className="flex gap-2">
          <button
            onClick={() => onAck(utos.id, "seen")}
            className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary/40 hover:bg-secondary"
          >
            Got it
          </button>
          <button
            onClick={() => onAck(utos.id, "done")}
            className="flex-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
          >
            Done
          </button>
        </div>
      ) : null}
    </li>
  );
}

function RosaStatusChip({ status }: { status: RosaStatus }) {
  const mounted = useMounted();
  const meta = statusMeta(mounted ? status.status : "off");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.cls}`}
      title="Rosa's live status"
      suppressHydrationWarning
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      Rosa · {mounted ? meta.label : "—"}
      {mounted && status.status === "available" && status.until && (
        <span className="font-normal opacity-80">· until {formatTimeOfDay(status.until)}</span>
      )}
    </span>
  );
}

function RosaAvailControl({
  status,
  onAvailable,
  onOff,
}: {
  status: RosaStatus;
  onAvailable: (hours: number) => void;
  onOff: () => void;
}) {
  const mounted = useMounted();
  if (!mounted) {
    return (
      <div className="mt-4 rounded-2xl bg-primary-foreground/10 p-3" suppressHydrationWarning>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70">
          Availability
        </div>
        <div className="mt-0.5 text-sm font-semibold opacity-70">Loading…</div>
      </div>
    );
  }
  const onShift = status.status === "on_shift";
  return (
    <div className="mt-4 rounded-2xl bg-primary-foreground/10 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground/70">
            Availability
          </div>
          <div className="mt-0.5 text-sm font-semibold">
            {onShift ? (
              <>
                On shift <span className="font-normal opacity-80">· automatic</span>
              </>
            ) : status.status === "available" && status.until ? (
              <>
                Available{" "}
                <span className="font-normal opacity-80">
                  · until {formatTimeOfDay(status.until)}
                </span>
              </>
            ) : (
              <>
                Off <span className="font-normal opacity-80">· resting</span>
              </>
            )}
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-2 py-1 text-[10.5px] font-semibold`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${onShift ? "bg-[oklch(0.85_0.14_150)]" : status.status === "available" ? "bg-accent" : "bg-primary-foreground/60"}`}
          />
          {onShift ? "On shift" : status.status === "available" ? "Available" : "Off"}
        </span>
      </div>
      {!onShift && (
        <div className="mt-3">
          <div className="text-[11px] text-primary-foreground/70">
            {status.quiet
              ? `Quiet hours (${QUIET_END_HOUR} AM – ${QUIET_START_HOUR - 12} PM overnight). Rest protected — only an emergency can reach you.`
              : status.restDay
                ? "Rest day. Off by default — opt in only if you'd like to be reached."
                : "Outside your shift. Rest is the default — opt in only if you're okay to be reached."}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {status.status === "available" ? (
              <button
                onClick={onOff}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary-foreground/25"
              >
                Switch to Off
              </button>
            ) : status.quiet ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 py-1.5 text-xs font-semibold text-primary-foreground/70">
                Available disabled until {QUIET_END_HOUR}:00 AM
              </span>
            ) : (
              <>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-foreground/70">
                  Available for
                </span>
                <button
                  onClick={() => onAvailable(1)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground text-primary px-3 py-1.5 text-xs font-semibold shadow-soft transition hover:bg-primary-foreground/90"
                >
                  1 hour
                </button>
                <button
                  onClick={() => onAvailable(2)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground text-primary px-3 py-1.5 text-xs font-semibold shadow-soft transition hover:bg-primary-foreground/90"
                >
                  2 hours
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Availability gate ----------
function AvailabilityGate({
  intent,
  status,
  helperName,
  canOverride = true,
  onCancel,
  onChoose,
}: {
  intent:
    | { kind: "utos"; content: string }
    | { kind: "task"; task: Omit<Task, "id" | "status" | "station"> };
  status: RosaStatus;
  helperName: string;
  canOverride?: boolean;
  onCancel: () => void;
  onChoose: (choice: "queue" | "override" | "emergency") => void;
}) {
  const kindLabel = intent.kind === "utos" ? "quick utos" : "task";
  const preview = intent.kind === "utos" ? intent.content : intent.task.title;
  const hard = status.quiet || status.restDay;
  const headline = status.quiet
    ? `It's quiet hours for ${helperName}.`
    : status.restDay
      ? `It's ${helperName}'s rest day.`
      : `This is outside ${helperName}'s hours.`;
  const body = status.quiet
    ? `Overnight is protected rest. Sending anyway will be logged as after-hours and counted toward OT / rest — an override on quiet hours. Only use Emergency if it truly can't wait.`
    : status.restDay
      ? `Her rest day is protected. It'll be logged as after-hours and counted toward OT / rest.`
      : `It'll be logged as after-hours and counted toward OT / rest.`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-3xl bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start gap-3">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${hard ? "bg-[oklch(0.95_0.06_35)] text-[oklch(0.42_0.15_35)]" : "bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]"}`}
          >
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-display text-lg text-foreground">{headline}</div>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-border/70 bg-secondary/40 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Sending {kindLabel}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">{preview}</div>
        </div>

        <div className="mt-4 space-y-2">
          <button
            onClick={() => onChoose("queue")}
            className="flex w-full items-start gap-3 rounded-2xl border border-border bg-background p-3 text-left transition hover:border-primary/40 hover:bg-secondary/60"
          >
            <Moon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div>
              <div className="text-sm font-semibold text-foreground">
                {intent.kind === "utos" ? "Let it wait" : "Queue for next shift"}
              </div>
              <div className="text-xs text-muted-foreground">
                {intent.kind === "utos"
                  ? "Sits as waiting. No ping. She'll see it when she's back on."
                  : "Added quietly. Appears on her board next working period."}
              </div>
            </div>
          </button>

          {canOverride ? (
            <>
              <button
                onClick={() => onChoose("override")}
                className="flex w-full items-start gap-3 rounded-2xl border border-accent/40 bg-terracotta-soft/40 p-3 text-left transition hover:bg-terracotta-soft/60"
              >
                <Send className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.42_0.13_60)]" />
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    Send anyway · after-hours
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Overrides her Off status. Flagged, logged, and counted toward OT / rest.
                  </div>
                </div>
              </button>

              <button
                onClick={() => onChoose("emergency")}
                className="flex w-full items-start gap-3 rounded-2xl border border-[oklch(0.75_0.15_35)] bg-[oklch(0.96_0.05_35)] p-3 text-left transition hover:bg-[oklch(0.93_0.07_35)]"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.5_0.18_30)]" />
                <div>
                  <div className="text-sm font-semibold text-[oklch(0.35_0.15_30)]">Emergency</div>
                  <div className="text-xs text-[oklch(0.4_0.1_30)]">
                    Crosses even quiet hours. Always logged as after-hours. Use only if it truly
                    can't wait.
                  </div>
                </div>
              </button>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Reaching {helperName} off-hours is reserved for on-site admins (Primary or
              Co-manager). As a remote admin you can queue this for her next shift.
            </div>
          )}
        </div>

        <button
          onClick={onCancel}
          className="mt-3 w-full rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function AfterHoursLedger({
  entries,
  ledgerDefault,
  onSetDefault,
  onUpdateEntry,
  audience,
  helperName,
}: {
  entries: LedgerEntry[];
  ledgerDefault: LedgerResolution;
  onSetDefault?: (r: LedgerResolution) => void;
  onUpdateEntry: (
    id: string,
    patch: Partial<Pick<LedgerEntry, "adjustMinutes" | "resolution">>,
  ) => void;
  audience: "manager" | "helper";
  helperName?: string;
}) {
  const mounted = useMounted();
  const [open, setOpen] = useState(false);

  // Filter to current month (based on doneTs).
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const monthEntries = useMemo(
    () => entries.filter((e) => e.doneTs >= monthStart).sort((a, b) => b.doneTs - a.doneTs),
    [entries, monthStart],
  );

  const totalMin = monthEntries.reduce((s, e) => s + ledgerEntryMinutes(e), 0);
  const premiumMin = monthEntries
    .filter((e) => e.resolution === "premium")
    .reduce((s, e) => s + ledgerEntryMinutes(e), 0);
  const restMin = totalMin - premiumMin;

  const heading =
    audience === "manager"
      ? `Rest owed this month${helperName ? ` · ${helperName}` : ""}`
      : "Rest owed this month · yours";

  if (!mounted) {
    return (
      <section
        className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft"
        suppressHydrationWarning
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {heading}
        </div>
        <div className="mt-1 font-display text-2xl text-foreground">—</div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {heading}
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-display text-2xl text-foreground">
              {fmtHoursMinutes(restMin)}
            </span>
            <span className="text-sm text-muted-foreground">
              time off in lieu
              {premiumMin > 0 && <> · {fmtHoursMinutes(premiumMin)} at rest-day premium</>}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Same numbers on both sides. On-shift work never lands here — every off-shift completion
            does.
          </p>
        </div>
        {audience === "manager" && onSetDefault && (
          <div className="shrink-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              House default
            </div>
            <div className="mt-1 inline-flex rounded-full border border-border bg-background p-0.5">
              {(["rest", "premium"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => onSetDefault(k)}
                  aria-pressed={ledgerDefault === k}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    ledgerDefault === k
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {k === "rest" ? "Banked rest" : "Rest-day premium"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {monthEntries.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">
          No after-hours yet this month.{" "}
          {audience === "helper" ? "Rest well." : "Nothing to reconcile."}
        </p>
      ) : (
        <>
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-foreground shadow-soft transition hover:border-primary/40"
          >
            {open
              ? "Hide entries"
              : `Show ${monthEntries.length} ${monthEntries.length === 1 ? "entry" : "entries"}`}
          </button>
          {open && (
            <ul className="mt-3 space-y-2">
              {monthEntries.map((e) => {
                const meta = reasonLabel(e.reason);
                const mins = ledgerEntryMinutes(e);
                return (
                  <li key={e.id} className="rounded-2xl border border-border/70 bg-background p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {e.title}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>
                            {formatTimeOfDay(e.startTs)} → {formatTimeOfDay(e.doneTs)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}
                          >
                            {meta.label}
                          </span>
                          {e.kind === "utos" && (
                            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-semibold text-pine-deep">
                              utos
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-display text-base text-foreground tabular-nums">
                          {fmtHoursMinutes(mins)}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {e.resolution === "premium" ? "rest-day premium" : "banked rest"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        Adjust
                        <input
                          type="number"
                          value={e.adjustMinutes}
                          onChange={(ev) =>
                            onUpdateEntry(e.id, { adjustMinutes: Number(ev.target.value) || 0 })
                          }
                          className="w-16 rounded-lg border border-border bg-card px-2 py-1 text-right text-[11px] font-semibold text-foreground focus:border-primary/50 focus:outline-none"
                        />
                        <span>min</span>
                      </label>
                      <div className="inline-flex rounded-full border border-border bg-card p-0.5">
                        {(["rest", "premium"] as const).map((k) => (
                          <button
                            key={k}
                            onClick={() => onUpdateEntry(e.id, { resolution: k })}
                            aria-pressed={e.resolution === k}
                            className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
                              e.resolution === k
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {k === "rest" ? "Banked rest" : "Rest-day premium"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <p className="mt-3 text-[10.5px] italic text-muted-foreground">
        Being Available doesn't waive rest — voluntarily reachable still counts.
      </p>
      <p className="mt-1 text-[10.5px] text-muted-foreground">
        Rest-day premium rates follow local law (placeholder, configurable).
      </p>
    </section>
  );
}

// ---------- Remote-admin "OFW view" glance ----------
function RemoteGlance({
  active,
  helperName,
  adminName,
}: {
  active: Task[];
  helperName: string;
  adminName: string;
}) {
  const doneToday = active.filter((t) => t.status === "done");
  const donePhotos = doneToday.filter((t) => t.photo).slice(0, 6);
  return (
    <section className="rounded-3xl border border-primary/20 bg-secondary/40 p-5 shadow-soft sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-pine-deep/80">
            Your OFW view · {adminName}
          </div>
          <h2 className="mt-0.5 font-display text-lg text-foreground">Home is holding steady.</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            You're watching from afar — schedules and off-hours reaches stay with the on-site
            managers. What you see here is the day, the money, and anything waiting on your yes.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Done today · {helperName} & team
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            <Check className="h-3 w-3" /> {doneToday.length}
          </span>
        </div>
        {donePhotos.length > 0 ? (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {donePhotos.map((t) => (
              <div key={t.id} className="overflow-hidden rounded-xl border border-border/70">
                <img
                  src={t.photo}
                  alt={t.title}
                  className="h-16 w-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs italic text-muted-foreground">
            Photos from finished tasks will show up here — a quiet way to see the day.
          </p>
        )}
        {doneToday.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {doneToday.slice(0, 4).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-foreground">{t.title}</span>
                <span className="shrink-0 text-muted-foreground">{t.time}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ---------- Rosa's private notes ----------

function MyNotes({
  helperId,
  onMakeTask,
}: {
  helperId: string;
  onMakeTask: (text: string) => void;
}) {
  const STORAGE_KEY = `mynotes:${helperId}`;
  const [notes, setNotes] = useState<MyNote[]>([]);
  const [text, setText] = useState("");
  const [holding, setHolding] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const holdStart = useRef<number>(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setNotes(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [STORAGE_KEY]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch {
      /* ignore */
    }
  }, [STORAGE_KEY, notes, hydrated]);

  const add = () => {
    const t = text.trim();
    if (!t) return;
    setNotes((prev) => [
      { id: `n-${Date.now()}`, text: t, done: false, createdAt: Date.now() },
      ...prev,
    ]);
    setText("");
  };
  const addVoice = (secs: number) => {
    const s = Math.max(1, Math.min(secs, 59));
    const label = `🎙️ Voice note · 0:${String(s).padStart(2, "0")}`;
    setNotes((prev) => [
      { id: `n-${Date.now()}`, text: label, done: false, voice: true, createdAt: Date.now() },
      ...prev,
    ]);
  };
  const toggle = (id: string) =>
    setNotes((p) => p.map((n) => (n.id === id ? { ...n, done: !n.done } : n)));
  const remove = (id: string) => setNotes((p) => p.filter((n) => n.id !== id));

  const startHold = () => {
    holdStart.current = Date.now();
    setHolding(true);
  };
  const endHold = () => {
    if (!holding) return;
    const secs = Math.max(1, Math.round((Date.now() - holdStart.current) / 1000));
    setHolding(false);
    addVoice(secs || 4);
  };

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft sm:p-5">
      <div className="flex items-center gap-2.5">
        <div className="grid h-9 w-9 place-items-center rounded-2xl bg-terracotta-soft/70 text-[oklch(0.55_0.13_55)]">
          <StickyNote className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-lg text-foreground">My Notes</h2>
          <p className="text-[11px] italic text-muted-foreground">Your notes — just for you.</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="e.g. Bumili ng suka mamaya"
          className="flex-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={add}
          className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
        >
          Add
        </button>
      </div>
      <button
        type="button"
        onMouseDown={startHold}
        onMouseUp={endHold}
        onMouseLeave={() => {
          if (holding) endHold();
        }}
        onTouchStart={startHold}
        onTouchEnd={endHold}
        className={`mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs font-semibold transition ${
          holding
            ? "border-terracotta bg-terracotta-soft/60 text-[oklch(0.45_0.12_55)]"
            : "border-border text-muted-foreground hover:text-foreground"
        }`}
      >
        <Mic className="h-3.5 w-3.5" />
        {holding ? "Recording… release to save" : "🎙️ Hold to record"}
      </button>

      {notes.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-secondary/50 px-3 py-3 text-center text-xs italic text-muted-foreground">
          Wala pang notes. Capture anything you hear out loud.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-2xl border border-border/60 bg-background/60 p-3">
              <div className="flex items-start gap-2.5">
                <button
                  onClick={() => toggle(n.id)}
                  aria-label={n.done ? "Mark not done" : "Mark done"}
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition ${
                    n.done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary"
                  }`}
                >
                  {n.done && <Check className="h-3 w-3" />}
                </button>
                <div
                  className={`min-w-0 flex-1 text-sm ${n.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                >
                  {n.text}
                </div>
                <button
                  onClick={() => remove(n.id)}
                  className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  aria-label="Delete note"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {!n.done && !n.voice && (
                <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => onMakeTask(n.text)}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-pine-deep hover:border-primary hover:text-primary"
                  >
                    <CalendarClock className="h-3 w-3" /> Make it a task
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NoteToTaskModal({
  initialTitle,
  helperId,
  onClose,
  onSubmit,
}: {
  initialTitle: string;
  helperId: string;
  onClose: () => void;
  onSubmit: (t: Omit<Task, "id" | "status" | "station">) => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [time, setTime] = useState("15:00");
  const [note, setNote] = useState("");

  const submit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    onSubmit({
      title: trimmed,
      helperId,
      time: `${hr}:${String(m).padStart(2, "0")} ${suffix}`,
      note: note.trim() || undefined,
      recurrence: "none",
      createdBy: "Ate Rosa",
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl text-foreground">Make it a task</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Give this note a time so it gets on the board and has a record.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Time">
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Note (optional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Any detail to remember"
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
          >
            Add to board
          </button>
        </div>
      </div>
    </div>
  );
}
