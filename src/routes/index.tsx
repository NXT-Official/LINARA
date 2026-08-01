import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, createContext, useContext } from "react";
import {
  Moon,
  Plus,
  Play,
  Check,
  Camera,
  Wallet,
  ClipboardList,
  X,
  Sparkles,
  AlertCircle,
  MessageCircle,
  RotateCcw,
  HelpCircle,
  Coins,
  Repeat,
  Send,
  Mic,
  Zap,
  Link2,
  CalendarClock,
  Trash2,
  Users,
  Columns3,
  Package,
  Minus,
  ShoppingBasket,
  Calendar,
  StickyNote,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: LinaraApp,
});

import { QUIET_END_HOUR, QUIET_START_HOUR } from "@/features/availability/availability.constants";
import type { RosaStatus } from "@/features/availability/availability.types";
import {
  EVENT_TEMPLATES,
  INITIAL_APPOINTMENTS,
  INITIAL_PREP_TASKS,
} from "@/features/appointments/appointment.constants";
import type { Appointment, EventTemplate } from "@/features/appointments/appointment.types";
import { RECEIPT_PLACEHOLDER } from "@/features/groceries/grocery.constants";
import type { GroceryContextValue, GroceryItem } from "@/features/groceries/grocery.types";
import { fmtPeso } from "@/features/groceries/grocery.utils";
import type {
  LedgerEntry,
  LedgerReason,
  LedgerResolution,
  ValeRequest,
} from "@/features/ledger/ledger.types";
import type { MyNote } from "@/features/notes/note.types";
import { INITIAL_PANTRY } from "@/features/pantry/pantry.constants";
import { PANTRY_CATEGORIES } from "@/features/pantry/pantry.types";
import type { PantryCategory, PantryItem } from "@/features/pantry/pantry.types";
import {
  adminPermSummary,
  adminTypeLabel,
  adminTypeShort,
  HELPERS,
  INITIAL_ADMINS,
  STATION_HEX,
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
import { INITIAL_SCHEDULES } from "@/features/shifts/shift.constants";
import type { DaySchedule, ShiftSegment, WeekSchedule } from "@/features/shifts/shift.types";
import { isMinuteInDay, summarizeDay } from "@/features/shifts/shift.utils";
import { INITIAL_ROUTINES, INITIAL_TASKS, PHOTO_POOL } from "@/features/tasks/task.constants";
import type { Recurrence, Routine, Status, Task } from "@/features/tasks/task.types";
import { isPalengke, recurrenceLabel, routineMatches } from "@/features/tasks/task.utils";
import { QUICK_UTOS_PRESETS } from "@/features/utos/utos.constants";
import type { QuickUtos } from "@/features/utos/utos.types";
import {
  displayTimeTo24h,
  fmtHM12,
  formatAppointmentDate,
  computePrepSchedule,
  formatClock,
  formatSimDate,
  formatTimeOfDay,
  parseHM,
  parseTimeToMinutes,
  toISODate,
  WEEKDAY_LONG,
  WEEKDAYS,
  weekdayOf,
  type Weekday,
} from "@/lib/time";

const GroceryCtx = createContext<GroceryContextValue | null>(null);
const useGrocery = () => useContext(GroceryCtx);

function RecurrenceBadge({ recurrence }: { recurrence?: Recurrence }) {
  const label = recurrenceLabel(recurrence);
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-pine-deep">
      <Repeat className="h-2.5 w-2.5" /> {label}
    </span>
  );
}

function LinaraApp() {
  const [viewAs, setViewAs] = useState<ViewAs>("ben");
  const [admins, setAdmins] = useState<Admin[]>(INITIAL_ADMINS);
  const currentAdmin = admins.find((a) => a.id === viewAs) ?? null;
  const role: "manager" | "helper" = viewAs === "rosa" ? "helper" : "manager";
  const adminType: AdminType | null = currentAdmin ? currentAdmin.type : null;
  const updateAdminType = (id: string, type: AdminType) =>
    setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, type } : a)));
  const [tasks, setTasks] = useState<Task[]>([...INITIAL_TASKS, ...INITIAL_PREP_TASKS]);
  const [vales, setVales] = useState<ValeRequest[]>([]);
  const [boardClosed, setBoardClosed] = useState(false);
  const [routines, setRoutines] = useState<Routine[]>(INITIAL_ROUTINES);
  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);
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
  const [pantry, setPantry] = useState<PantryItem[]>(INITIAL_PANTRY);
  const adjustPantry = (id: string, delta: number) =>
    setPantry((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, qty: Math.max(0, Math.round((p.qty + delta) * 100) / 100) } : p,
      ),
    );
  const setPantryQty = (id: string, qty: number) =>
    setPantry((prev) => prev.map((p) => (p.id === id ? { ...p, qty: Math.max(0, qty) } : p)));
  const addPantryItem = (item: Omit<PantryItem, "id">) =>
    setPantry((prev) => [...prev, { ...item, id: `p${Date.now()}` }]);
  const removePantryItem = (id: string) => setPantry((prev) => prev.filter((p) => p.id !== id));

  // ---- Grocery list ----
  const [grocery, setGrocery] = useState<GroceryItem[]>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());
  const [groceryModalOpen, setGroceryModalOpen] = useState(false);
  const [groceryBudget, setGroceryBudget] = useState(1500);
  const [receiptPhoto, setReceiptPhoto] = useState<string | null>(null);
  // Auto-derived suggestions: low pantry items not already in grocery and not dismissed.
  const groceryDisplay = useMemo<GroceryItem[]>(() => {
    const covered = new Set(grocery.map((g) => g.pantryItemId).filter(Boolean) as string[]);
    const suggestions: GroceryItem[] = pantry
      .filter((p) => p.qty <= p.par && !covered.has(p.id) && !dismissedSuggestions.has(p.id))
      .map((p) => ({
        id: `sug-${p.id}`,
        name: p.name,
        qty: Math.max(1, Math.round((p.par - p.qty) * 100) / 100),
        unit: p.unit,
        pantryItemId: p.id,
        bought: false,
      }));
    return [...grocery, ...suggestions];
  }, [grocery, pantry, dismissedSuggestions]);
  const toBuyCount = groceryDisplay.filter((g) => !g.bought).length;
  const grocerySpent = useMemo(
    () => grocery.filter((g) => g.bought).reduce((s, g) => s + (g.costPHP ?? 0), 0),
    [grocery],
  );
  const addManualGrocery = (name: string, qty: number, unit: string) => {
    if (!name.trim()) return;
    setGrocery((prev) => [
      ...prev,
      { id: `g${Date.now()}`, name: name.trim(), qty, unit: unit.trim() || "pcs", bought: false },
    ]);
  };
  const toggleGroceryBought = (item: GroceryItem) => {
    const isSuggestion = item.id.startsWith("sug-");
    if (isSuggestion) {
      // Promote suggestion into state as bought AND bump pantry.
      setGrocery((prev) => [...prev, { ...item, id: `g${Date.now()}`, bought: true }]);
      if (item.pantryItemId) adjustPantry(item.pantryItemId, item.qty);
      return;
    }
    // Existing state item — flip bought and adjust pantry accordingly.
    setGrocery((prev) =>
      prev.map((g) =>
        g.id === item.id
          ? { ...g, bought: !g.bought, costPHP: g.bought ? undefined : g.costPHP }
          : g,
      ),
    );
    if (item.pantryItemId) adjustPantry(item.pantryItemId, item.bought ? -item.qty : item.qty);
  };
  const setGroceryCost = (item: GroceryItem, cost: number | undefined) => {
    if (item.id.startsWith("sug-")) return;
    setGrocery((prev) => prev.map((g) => (g.id === item.id ? { ...g, costPHP: cost } : g)));
  };
  const removeGroceryItem = (item: GroceryItem) => {
    if (item.id.startsWith("sug-")) {
      // Dismiss this suggestion until pantry qty changes and it re-qualifies.
      if (item.pantryItemId)
        setDismissedSuggestions((prev) => new Set(prev).add(item.pantryItemId!));
      return;
    }
    // If already marked bought, roll back the pantry bump so counts stay honest.
    if (item.bought && item.pantryItemId) adjustPantry(item.pantryItemId, -item.qty);
    setGrocery((prev) => prev.filter((g) => g.id !== item.id));
  };
  // Clear dismissals if the pantry item is no longer low (so a fresh dip re-suggests).
  useEffect(() => {
    setDismissedSuggestions((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        const p = pantry.find((x) => x.id === id);
        if (!p || p.qty > p.par) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pantry]);
  const groceryCtxValue: GroceryContextValue = {
    display: groceryDisplay,
    toBuyCount,
    budget: groceryBudget,
    spent: grocerySpent,
    remaining: groceryBudget - grocerySpent,
    receiptPhoto,
    addManual: addManualGrocery,
    toggleBought: toggleGroceryBought,
    setCost: setGroceryCost,
    setBudget: (n) => setGroceryBudget(Math.max(0, n)),
    attachReceipt: () => setReceiptPhoto(RECEIPT_PLACEHOLDER),
    clearReceipt: () => setReceiptPhoto(null),
    remove: removeGroceryItem,
    isPalengkeTask: isPalengke,
    openModal: () => setGroceryModalOpen(true),
  };
  // Simulated "today" — starts on Tuesday, July 7, 2026 to match the seed board.
  const [simDate, setSimDate] = useState<Date>(new Date(2026, 6, 7));
  const currentHelperId = "rosa";

  // ---- Shift schedules (per helper, per weekday) ----
  const [schedules, setSchedules] = useState<Record<string, WeekSchedule>>(INITIAL_SCHEDULES);
  const updateDaySchedule = (helperId: string, day: Weekday, patch: Partial<DaySchedule>) => {
    setSchedules((prev) => {
      const wk = prev[helperId] ?? INITIAL_SCHEDULES[helperId];
      return { ...prev, [helperId]: { ...wk, [day]: { ...wk[day], ...patch } } };
    });
  };

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
  // ---- Simulated clock (prototype only) ----
  // simOffsetMs shifts "now" for demo purposes; null = real time.
  const [simOffsetMs, setSimOffsetMs] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  useEffect(() => {
    const tick = () => setNowTs(Date.now() + (simOffsetMs ?? 0));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [simOffsetMs]);
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
    const daySched = (schedules.rosa ?? INITIAL_SCHEDULES.rosa)[wd];
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
    const day = (schedules.rosa ?? INITIAL_SCHEDULES.rosa)[wd];
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
      if (u && ack === "done" && currentHelperId === "rosa" && rosaStatus.status !== "on_shift") {
        // Utos completed off-shift: a small after-hours ledger entry (5 min).
        const reason = classifyRosaReason(nowTs, !!u.emergency);
        logLedger({
          sourceId: u.id,
          kind: "utos",
          title: u.content,
          startTs: u.timestamp,
          doneTs: nowTs,
          autoMinutes: 5,
          reason,
        });
      }
      return next;
    });
  };

  const updateStatus = (id: string, status: Status, photo?: string) => {
    setTasks((prev) => {
      const cur = prev.find((t) => t.id === id);
      if (!cur) return prev;
      let startedAt = cur.startedAt;
      if (status === "in_progress" && cur.status !== "in_progress" && !startedAt) startedAt = nowTs;
      const updated = {
        ...cur,
        status,
        photo: photo ?? cur.photo,
        blockReason: status === "blocked" ? cur.blockReason : undefined,
        startedAt,
      };
      // On completion, log if Rosa completes off-shift.
      if (
        status === "done" &&
        cur.status !== "done" &&
        cur.helperId === "rosa" &&
        rosaStatus.status !== "on_shift"
      ) {
        const start = startedAt ?? nowTs - 5 * 60_000;
        const autoMinutes = Math.max(1, Math.round((nowTs - start) / 60_000));
        const reason = classifyRosaReason(nowTs, !!cur.emergency);
        logLedger({
          sourceId: cur.id,
          kind: "task",
          title: cur.title,
          station: cur.station,
          appointmentTitle: cur.appointmentTitle,
          startTs: start,
          doneTs: nowTs,
          autoMinutes,
          reason,
        });
      }
      return prev.map((t) => (t.id === id ? updated : t));
    });
  };

  const updateLedgerEntry = (
    id: string,
    patch: Partial<Pick<LedgerEntry, "adjustMinutes" | "resolution">>,
  ) => {
    setLedger((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const blockTask = (id: string, reason: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "blocked", blockReason: reason } : t)),
    );
  };

  const rescheduleTask = (id: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: "todo", blockReason: undefined, queued: boardClosed ? true : undefined }
          : t,
      ),
    );
  };

  type AddTaskFlags = SendFlags & { queuedForShift?: boolean; suggested?: boolean };
  const addTask = (t: Omit<Task, "id" | "status" | "station">, flags: AddTaskFlags = {}) => {
    const helper = helperById(t.helperId);
    const shouldQueue = boardClosed || flags.queuedForShift;
    setTasks((prev) => [
      ...prev,
      {
        ...t,
        id: `t${Date.now()}`,
        status: "todo",
        station: helper.station,
        queued: shouldQueue || undefined,
        queuedForShift: flags.queuedForShift || undefined,
        afterHours: flags.afterHours,
        emergency: flags.emergency,
        suggested: flags.suggested || undefined,
      },
    ]);
  };

  const approveSuggestion = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, suggested: undefined } : t)));
  };
  const dismissSuggestion = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const setClosed = (closed: boolean) => {
    setBoardClosed(closed);
    if (!closed) {
      // Opening the board — queued tasks graduate to today's To-do
      setTasks((prev) => prev.map((t) => (t.queued ? { ...t, queued: undefined } : t)));
    }
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

  const addRoutine = (r: Omit<Routine, "id" | "station">) => {
    const helper = helperById(r.helperId);
    setRoutines((prev) => [...prev, { ...r, id: `r${Date.now()}`, station: helper.station }]);
  };

  const removeRoutine = (id: string) => {
    setRoutines((prev) => prev.filter((r) => r.id !== id));
  };

  type PrepDraft = { title: string; leadMinutes: number; helperId: string; note?: string };
  const addAppointment = (a: Omit<Appointment, "id">, preps: PrepDraft[]) => {
    const id = `a${Date.now()}`;
    setAppointments((prev) => [...prev, { ...a, id }]);
    const newTasks: Task[] = preps.map((p, i) => {
      const { date, time } = computePrepSchedule(a.date, a.time, p.leadMinutes);
      const helper = helperById(p.helperId);
      return {
        id: `${id}-p${i}-${Date.now()}`,
        title: p.title,
        note: p.note,
        time,
        helperId: p.helperId,
        station: helper.station,
        status: "todo",
        appointmentId: id,
        appointmentTitle: a.title,
        scheduledDate: date,
        leadMinutes: p.leadMinutes,
      };
    });
    if (newTasks.length > 0) setTasks((prev) => [...prev, ...newTasks]);
  };

  const removeAppointment = (id: string) => {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    setTasks((prev) => prev.filter((t) => t.appointmentId !== id));
  };

  const updateAppointment = (id: string, patch: { title: string; date: string; time: string }) => {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setTasks((prev) =>
      prev.map((t) => {
        if (t.appointmentId !== id) return t;
        const lead = t.leadMinutes ?? 0;
        const { date: newDate, time: newTime } = computePrepSchedule(patch.date, patch.time, lead);
        const changed =
          newDate !== t.scheduledDate || newTime !== t.time || patch.title !== t.appointmentTitle;
        if (!changed) return { ...t, appointmentTitle: patch.title };
        const timeMoved = newDate !== t.scheduledDate || newTime !== t.time;
        return {
          ...t,
          time: newTime,
          scheduledDate: newDate,
          appointmentTitle: patch.title,
          rescheduleNotice: timeMoved
            ? { oldTime: t.time, oldDate: t.scheduledDate, appointmentTitle: patch.title }
            : t.rescheduleNotice,
        };
      }),
    );
  };

  const startNewDay = () => {
    const next = new Date(simDate);
    next.setDate(next.getDate() + 1);
    const wd = weekdayOf(next);
    setSimDate(next);
    setBoardClosed(false);
    // Nightly wipe: quick utos are genuinely deleted from state — no history array, no log.
    setUtosWipedToday(utosList.length > 0);
    setUtosList([]);
    setTasks((prev) => {
      // Keep: unfinished recurring instances (they carry over) and blocked items.
      // Drop: finished (done) tasks and one-off tasks from yesterday.
      const kept = prev
        .filter((t) => {
          if (t.status === "done") return false;
          if (t.appointmentId) return true; // appointment prep tasks persist until done
          if (!t.routineId) return false; // one-offs (including queued one-offs) clear at day-start
          return true;
        })
        .map((t) => ({ ...t, queued: undefined as boolean | undefined }));

      // Spawn a fresh instance for every matching routine that isn't already live.
      const liveRoutineIds = new Set(kept.map((t) => t.routineId).filter(Boolean));
      const spawned: Task[] = routines
        .filter((r) => routineMatches(r, wd) && !liveRoutineIds.has(r.id))
        .map((r) => ({
          id: `t-${r.id}-${next.getTime()}`,
          title: r.title,
          note: r.note,
          time: r.time,
          helperId: r.helperId,
          station: r.station,
          status: "todo",
          recurrence: r.recurrence,
          routineId: r.id,
        }));

      return [...kept, ...spawned].sort(
        (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
      );
    });
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
      <GroceryCtx.Provider value={groceryCtxValue}>
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
              onAddAppointment={addAppointment}
              onRemoveAppointment={removeAppointment}
              onUpdateAppointment={updateAppointment}
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
              onAdjustPantry={adjustPantry}
              onSetPantryQty={setPantryQty}
              onAddPantryItem={addPantryItem}
              onRemovePantryItem={removePantryItem}
              schedules={schedules}
              onUpdateDaySchedule={updateDaySchedule}
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
              onAdjustPantry={adjustPantry}
              onSetPantryQty={setPantryQty}
              onAddPantryItem={addPantryItem}
              onRemovePantryItem={removePantryItem}
              weekSchedule={schedules[currentHelperId] ?? INITIAL_SCHEDULES[currentHelperId]}
              simDate={simDate}
              onAddTask={(t) => addTask(t)}
              invites={invites}
              onFindInvite={findInviteByCode}
              onClaimInvite={claimInvite}
              onFlagInvite={flagInvite}
            />
          )}
        </main>
        {groceryModalOpen && <GroceryModal onClose={() => setGroceryModalOpen(false)} />}
      </GroceryCtx.Provider>
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
  onAddAppointment,
  onRemoveAppointment,
  onUpdateAppointment,
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
  onAdjustPantry,
  onSetPantryQty,
  onAddPantryItem,
  onRemovePantryItem,
  schedules,
  onUpdateDaySchedule,
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
  appointments: Appointment[];
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
  onAddAppointment: (
    a: Omit<Appointment, "id">,
    preps: Array<{ title: string; leadMinutes: number; helperId: string; note?: string }>,
  ) => void;
  onRemoveAppointment: (id: string) => void;
  onUpdateAppointment: (id: string, patch: { title: string; date: string; time: string }) => void;
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
  pantry: PantryItem[];
  onAdjustPantry: (id: string, delta: number) => void;
  onSetPantryQty: (id: string, qty: number) => void;
  onAddPantryItem: (item: Omit<PantryItem, "id">) => void;
  onRemovePantryItem: (id: string) => void;
  schedules: Record<string, WeekSchedule>;
  onUpdateDaySchedule: (helperId: string, day: Weekday, patch: Partial<DaySchedule>) => void;
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
          <ShiftsSection
            schedules={schedules}
            onUpdate={onUpdateDaySchedule}
            readOnly={!canEditShifts}
          />
          <QuickUtosLauncher onSend={gatedSendUtos} helperName={helperName} />
          <RoutinesView routines={routines} onAdd={onAddRoutine} onRemove={onRemoveRoutine} />
          <AppointmentsSection
            appointments={appointments}
            tasks={tasks}
            simDate={simDate}
            onAdd={onAddAppointment}
            onRemove={onRemoveAppointment}
            onUpdate={onUpdateAppointment}
          />
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
          <PantrySection
            items={pantry}
            onAdjust={onAdjustPantry}
            onSetQty={onSetPantryQty}
            onAdd={onAddPantryItem}
            onRemove={onRemovePantryItem}
          />
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
          schedules={schedules}
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

function BottomNav({
  items,
  active,
  onChange,
}: {
  items: Array<{ key: string; label: string; Icon: typeof ClipboardList }>;
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-6xl items-stretch justify-around px-2 sm:px-6">
        {items.map(({ key, label, Icon }) => {
          const isActive = active === key;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 py-2.5 text-[11px] font-semibold transition ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
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

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-right text-sm font-semibold text-foreground">{value}</span>
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

function ShiftsSection({
  schedules,
  onUpdate,
  readOnly = false,
}: {
  schedules: Record<string, WeekSchedule>;
  onUpdate: (helperId: string, day: Weekday, patch: Partial<DaySchedule>) => void;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState<{ helperId: string; day: Weekday } | null>(null);

  // Coverage warnings: any weekday where 2+ helpers are on rest.
  const restByDay = useMemo(() => {
    const map: Record<Weekday, string[]> = {
      Mon: [],
      Tue: [],
      Wed: [],
      Thu: [],
      Fri: [],
      Sat: [],
      Sun: [],
    };
    for (const h of HELPERS) {
      const wk = schedules[h.id];
      if (!wk) continue;
      for (const d of WEEKDAYS) if (wk[d].rest) map[d].push(h.short);
    }
    return map;
  }, [schedules]);
  const warnings = WEEKDAYS.map((d) => ({ day: d, offs: restByDay[d] })).filter(
    (w) => w.offs.length >= 2,
  );

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl text-foreground">Shifts</h2>
          <p className="text-xs text-muted-foreground">
            Weekly pattern per helper. Tap a day to edit hours or break.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep">
          <CalendarClock className="h-3 w-3" /> {HELPERS.length} helpers
        </span>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {warnings.map((w) => (
            <div
              key={w.day}
              className="flex items-start gap-2 rounded-2xl border border-terracotta/40 bg-terracotta-soft/50 px-3 py-2 text-xs text-[oklch(0.38_0.09_60)]"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <span className="font-semibold">No one covers {WEEKDAY_LONG[w.day]}</span> —{" "}
                {w.offs.join(" & ")} both off.
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {HELPERS.map((h) => {
          const wk = schedules[h.id];
          if (!wk) return null;
          const restLabel =
            WEEKDAYS.filter((d) => wk[d].rest)
              .map((d) => WEEKDAY_LONG[d])
              .join(", ") || "None";
          return (
            <div key={h.id} className="rounded-2xl border border-border/70 bg-background/40 p-3.5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Avatar initials={h.initials} />
                  <div>
                    <div className="text-sm font-semibold text-foreground">{h.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {h.station} · Rest: {restLabel}
                    </div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEKDAYS.map((d) => {
                  const day = wk[d];
                  const isEditing = editing?.helperId === h.id && editing.day === d;
                  return (
                    <button
                      key={d}
                      disabled={readOnly}
                      onClick={() => setEditing(isEditing ? null : { helperId: h.id, day: d })}
                      className={`flex flex-col items-center rounded-xl border px-1 py-1.5 text-[10px] transition ${
                        isEditing
                          ? "border-primary bg-primary/10 text-primary"
                          : day.rest
                            ? "border-border/60 bg-secondary/50 text-muted-foreground"
                            : "border-border/70 bg-card text-foreground hover:border-primary/40"
                      } ${readOnly ? "cursor-default opacity-95" : ""}`}
                    >
                      <span className="font-semibold uppercase tracking-wider">{d}</span>
                      <span className="mt-0.5 leading-tight">
                        {day.rest ? "Rest" : day.segments.map((s) => `${s.start}`).join("/") || "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className={
                      editing?.helperId === h.id && editing.day === d ? "hidden" : "hidden"
                    }
                  />
                ))}
                {editing && editing.helperId === h.id ? null : (
                  <span>{readOnly ? "Remote admin — read-only view." : "Tap a day to edit."}</span>
                )}
              </div>
              {editing && editing.helperId === h.id && (
                <DayEditor
                  key={editing.day}
                  day={editing.day}
                  value={wk[editing.day]}
                  onChange={(patch) => onUpdate(h.id, editing.day, patch)}
                  onClose={() => setEditing(null)}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DayEditor({
  day,
  value,
  onChange,
  onClose,
}: {
  day: Weekday;
  value: DaySchedule;
  onChange: (patch: Partial<DaySchedule>) => void;
  onClose: () => void;
}) {
  const toggleRest = () => {
    if (value.rest) {
      onChange({ rest: false, segments: [{ start: "08:00", end: "17:00" }] });
    } else {
      onChange({ rest: true, segments: [] });
    }
  };
  const updateSeg = (idx: number, patch: Partial<ShiftSegment>) => {
    const next = value.segments.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange({ segments: next });
  };
  const addSegment = () =>
    onChange({ segments: [...value.segments, { start: "14:00", end: "18:00" }] });
  const removeSegment = (idx: number) =>
    onChange({ segments: value.segments.filter((_, i) => i !== idx) });

  return (
    <div className="mt-3 rounded-2xl border border-primary/30 bg-secondary/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold text-pine-deep">{WEEKDAY_LONG[day]}</div>
        <div className="flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-pine-deep">
            <input
              type="checkbox"
              checked={value.rest}
              onChange={toggleRest}
              className="h-3.5 w-3.5 accent-current"
            />
            Rest day
          </label>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-card"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {!value.rest && (
        <div className="space-y-2">
          {value.segments.map((seg, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="time"
                value={seg.start}
                onChange={(e) => updateSeg(i, { start: e.target.value })}
                className="w-full rounded-lg border border-input bg-card px-2 py-1 text-xs"
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="time"
                value={seg.end}
                onChange={(e) => updateSeg(i, { end: e.target.value })}
                className="w-full rounded-lg border border-input bg-card px-2 py-1 text-xs"
              />
              {value.segments.length > 1 && (
                <button
                  onClick={() => removeSegment(i)}
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addSegment}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5"
          >
            <Plus className="h-3 w-3" /> Split shift
          </button>
          <div className="mt-3 border-t border-border/60 pt-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Daily rest break
            </div>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={value.breakStart ?? ""}
                onChange={(e) => onChange({ breakStart: e.target.value || undefined })}
                className="w-full rounded-lg border border-input bg-card px-2 py-1 text-xs"
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="time"
                value={value.breakEnd ?? ""}
                onChange={(e) => onChange({ breakEnd: e.target.value || undefined })}
                className="w-full rounded-lg border border-input bg-card px-2 py-1 text-xs"
              />
              {(value.breakStart || value.breakEnd) && (
                <button
                  onClick={() => onChange({ breakStart: undefined, breakEnd: undefined })}
                  className="rounded-full p-1 text-muted-foreground hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">Summary: {summarizeDay(value)}</p>
        </div>
      )}
    </div>
  );
}

function HelperLane({ helper, tasks }: { helper: Helper; tasks: Task[] }) {
  const [open, setOpen] = useState(false);
  const color = STATION_HEX[helper.station];
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)),
    [tasks],
  );
  const doneCount = sorted.filter((t) => t.status === "done").length;
  const inProg = sorted.find((t) => t.status === "in_progress");
  const upcoming = sorted.filter((t) => t.status === "todo" || t.status === "blocked");
  const nowTask = inProg ?? upcoming[0];
  const nextTask = upcoming.find((t) => t.id !== nowTask?.id);
  const nowMin = inProg ? parseTimeToMinutes(inProg.time) : Number.POSITIVE_INFINITY;
  const overdueSet = new Set(
    sorted
      .filter(
        (t) =>
          t.id !== inProg?.id &&
          (t.status === "todo" || t.status === "blocked") &&
          (t.status === "blocked" || parseTimeToMinutes(t.time) < nowMin),
      )
      .map((t) => t.id),
  );

  const pill =
    overdueSet.size > 0
      ? {
          text: `⚠ ${overdueSet.size} overdue`,
          cls: "bg-[oklch(0.93_0.06_35)] text-[oklch(0.42_0.15_35)]",
        }
      : inProg
        ? {
            text: `Now: ${inProg.title}`,
            cls: "bg-[oklch(0.93_0.08_75)] text-[oklch(0.4_0.13_75)]",
          }
        : { text: "On track", cls: "bg-[oklch(0.93_0.05_150)] text-[oklch(0.36_0.1_150)]" };

  const pct = sorted.length === 0 ? 0 : Math.round((doneCount / sorted.length) * 100);

  return (
    <section
      className="overflow-hidden rounded-3xl border bg-card shadow-soft"
      style={{ borderColor: `${color.solid}55` }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-secondary/30"
      >
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-white shadow-soft"
          style={{ backgroundColor: color.solid }}
        >
          {helper.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-base text-foreground">{helper.short}</span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {helper.station}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: color.solid }}
              />
            </div>
            <span className="shrink-0 text-[11px] font-semibold text-muted-foreground tabular-nums">
              {doneCount} of {sorted.length}
            </span>
          </div>
        </div>
        <span
          className={`ml-1 max-w-[42%] shrink-0 truncate rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${pill.cls}`}
        >
          {pill.text}
        </span>
      </button>

      {(nowTask || nextTask) && (
        <div className="grid gap-2 px-4 pb-3 sm:grid-cols-2">
          {nowTask && (
            <LaneNowRow
              label={inProg ? "Now" : "Next up"}
              task={nowTask}
              color={color}
              late={overdueSet.has(nowTask.id)}
            />
          )}
          {nextTask && (
            <LaneNowRow
              label="Next"
              task={nextTask}
              color={color}
              late={overdueSet.has(nextTask.id)}
              muted
            />
          )}
        </div>
      )}

      {open && (
        <div className="border-t border-border/60 px-2 py-2">
          {sorted.length === 0 ? (
            <div className="px-3 py-2 text-xs text-muted-foreground">No tasks today.</div>
          ) : (
            sorted.map((t) => {
              const isLate = overdueSet.has(t.id);
              const dotCls =
                t.status === "done"
                  ? "bg-[oklch(0.68_0.14_150)]"
                  : t.status === "in_progress"
                    ? "bg-accent"
                    : isLate
                      ? "bg-[oklch(0.6_0.18_35)]"
                      : "bg-muted-foreground/40";
              return (
                <div key={t.id} className="flex items-start gap-2.5 rounded-xl px-2 py-2">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotCls}`} />
                  <span className="w-16 shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                    {t.time}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm ${t.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}
                    >
                      {t.title}
                    </div>
                    {t.note && (
                      <div className="mt-0.5 line-clamp-2 text-[11px] italic text-muted-foreground">
                        "{t.note}"
                      </div>
                    )}
                  </div>
                  {isLate && (
                    <span className="shrink-0 rounded-full bg-[oklch(0.93_0.06_35)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[oklch(0.42_0.15_35)]">
                      Late
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

function LaneNowRow({
  label,
  task,
  color,
  late,
  muted,
}: {
  label: string;
  task: Task;
  color: { solid: string; soft: string };
  late: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className="rounded-2xl border px-3 py-2"
      style={{
        backgroundColor: muted ? "transparent" : color.soft,
        borderColor: `${color.solid}40`,
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className="text-[11px] font-semibold tabular-nums text-foreground">
          · {task.time}
        </span>
        {late && (
          <span className="rounded-full bg-[oklch(0.93_0.06_35)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[oklch(0.42_0.15_35)]">
            Late
          </span>
        )}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium text-foreground">{task.title}</div>
      {isPalengke(task) && (
        <div className="mt-1">
          <PalengkeChip compact />
        </div>
      )}
    </div>
  );
}

// ---------- The Board: status-oriented view (built, not yet wired) ----------
function TheBoardStatusLists({ tasks }: { tasks: Task[] }) {
  const [tab, setTab] = useState<"todo" | "doing" | "done">("todo");
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)),
    [tasks],
  );
  const todo = sorted.filter((t) => t.status === "todo" || t.status === "blocked");
  const doing = sorted.filter((t) => t.status === "in_progress");
  const done = sorted.filter((t) => t.status === "done");
  const nowMin = doing.length > 0 ? parseTimeToMinutes(doing[0].time) : null;
  const overdueId = (t: Task) =>
    t.status === "blocked" || (nowMin !== null && parseTimeToMinutes(t.time) < nowMin);

  const tabs = [
    { key: "todo" as const, label: "To-do", count: todo.length, list: todo },
    { key: "doing" as const, label: "Doing", count: doing.length, list: doing },
    { key: "done" as const, label: "Done", count: done.length, list: done },
  ];
  const current = tabs.find((t) => t.key === tab)!;

  // Insertion index for the "now" marker in the To-do timeline:
  // place it before the first todo whose time >= the current in-progress time.
  let nowMarkerIdx = -1;
  if (tab === "todo" && nowMin !== null) {
    nowMarkerIdx = todo.findIndex((t) => parseTimeToMinutes(t.time) >= nowMin);
    if (nowMarkerIdx === -1) nowMarkerIdx = todo.length; // all overdue → marker at the end
  }

  return (
    <section className="space-y-3">
      <div className="inline-flex w-full rounded-full border border-border bg-card p-1 shadow-soft">
        {tabs.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                active
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-secondary text-pine-deep"}`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2.5">
        {current.list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Nothing here.
          </div>
        ) : (
          current.list.map((t, i) => (
            <div key={t.id}>
              {tab === "todo" && i === nowMarkerIdx && <NowMarker />}
              <BoardTaskCard
                task={t}
                late={tab !== "done" && overdueId(t)}
                isDoing={t.status === "in_progress"}
              />
            </div>
          ))
        )}
        {tab === "todo" && nowMarkerIdx === current.list.length && current.list.length > 0 && (
          <NowMarker />
        )}
      </div>
    </section>
  );
}

function NowMarker() {
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <span className="h-2 w-2 rounded-full bg-accent" />
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent-foreground/80">
        now
      </span>
      <span className="h-px flex-1 bg-accent/40" />
    </div>
  );
}

function BoardTaskCard({ task, late, isDoing }: { task: Task; late: boolean; isDoing: boolean }) {
  const [showNote, setShowNote] = useState(false);
  const helper = helperById(task.helperId);
  const color = STATION_HEX[task.station];
  const isDone = task.status === "done";
  return (
    <article
      className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-soft"
      style={{ borderLeft: `4px solid ${color.solid}` }}
    >
      <div className="flex items-start gap-2.5 p-3">
        <span className="w-14 shrink-0 pt-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
          {task.time}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4
              className={`text-sm font-semibold ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}
            >
              {task.title}
            </h4>
            {isDoing && (
              <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-foreground">
                Doing
              </span>
            )}
            {late && (
              <span className="rounded-full bg-[oklch(0.93_0.06_35)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[oklch(0.42_0.15_35)]">
                Late
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
              style={{ backgroundColor: color.soft, color: "var(--pine-deep)" }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color.solid }} />
              {task.station} · {helper.short}
            </span>
            <RecurrenceBadge recurrence={task.recurrence} />
            {task.appointmentTitle && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-pine-deep">
                <Link2 className="h-2.5 w-2.5" /> {task.appointmentTitle}
              </span>
            )}
            {task.note && (
              <button
                onClick={() => setShowNote((s) => !s)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
              >
                <HelpCircle className="h-2.5 w-2.5" /> {showNote ? "Hide note" : "Note"}
              </button>
            )}
            {isPalengke(task) && <PalengkeChip />}
          </div>
          {showNote && task.note && (
            <p className="mt-2 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
              "{task.note}"
            </p>
          )}
        </div>
      </div>
    </article>
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

function TaskCard({ task }: { task: Task }) {
  const helper = helperById(task.helperId);
  return (
    <article className="group rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft transition hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-snug text-foreground">{task.title}</h4>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stationTone[task.station]}`}
        >
          {task.station}
        </span>
      </div>
      {(recurrenceLabel(task.recurrence) || task.appointmentTitle) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <RecurrenceBadge recurrence={task.recurrence} />
          {task.appointmentTitle && (
            <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-2 py-0.5 text-[10px] font-medium text-[oklch(0.38_0.09_60)]">
              <Link2 className="h-2.5 w-2.5" /> {task.appointmentTitle}
            </span>
          )}
        </div>
      )}
      {task.scheduledDate && (
        <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {formatAppointmentDate(task.scheduledDate)}
        </div>
      )}
      {task.note && (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{task.note}</p>
      )}
      {isPalengke(task) && (
        <div className="mt-2">
          <PalengkeChip />
        </div>
      )}
      {task.photo && (
        <div className="mt-3 overflow-hidden rounded-xl">
          <img src={task.photo} alt="" className="h-28 w-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar initials={helper.initials} />
          <span className="text-xs font-medium text-foreground">{helper.short}</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground">{task.time}</span>
      </div>
      {task.createdBy && (
        <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          from {task.createdBy}
        </div>
      )}
    </article>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
      {initials}
    </div>
  );
}

function RescheduleNotice({
  notice,
  newTime,
}: {
  notice?: Task["rescheduleNotice"];
  newTime: string;
}) {
  if (!notice) return null;
  return (
    <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] leading-snug text-pine-deep">
      <span className="mt-0.5">⏱</span>
      <span>
        <span className="font-semibold">Rescheduled:</span> {notice.oldTime} → {newTime} because{" "}
        <span className="italic">{notice.appointmentTitle}</span> changed.
      </span>
    </div>
  );
}

// ---------- New task modal ----------
function NewTaskModal({
  onClose,
  onAdd,
  isRemote = false,
}: {
  onClose: () => void;
  onAdd: (t: Omit<Task, "id" | "status" | "station">, opts?: { sendLive?: boolean }) => void;
  isRemote?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [helperId, setHelperId] = useState(HELPERS[0].id);
  const [time, setTime] = useState("08:00");
  const [note, setNote] = useState("");
  const [repeatKind, setRepeatKind] = useState<"none" | "daily" | "weekdays">("none");
  const [days, setDays] = useState<Weekday[]>([]);
  const [sendLive, setSendLive] = useState(false);

  const toggleDay = (d: Weekday) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const submit = () => {
    if (!title.trim()) return;
    const [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    const recurrence: Recurrence =
      repeatKind === "daily"
        ? "daily"
        : repeatKind === "weekdays" && days.length > 0
          ? WEEKDAYS.filter((d) => days.includes(d)) // keep canonical order
          : "none";
    onAdd(
      {
        title: title.trim(),
        helperId,
        time: `${hr}:${String(m).padStart(2, "0")} ${suffix}`,
        note: note.trim() || undefined,
        recurrence,
      },
      { sendLive: isRemote ? sendLive : undefined },
    );
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl text-foreground">
            {isRemote ? "Suggest a task" : "New task"}
          </h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {isRemote && (
          <p className="mt-1 text-xs text-muted-foreground">
            From afar you can propose things — an on-site manager approves them onto the board.
          </p>
        )}
        <div className="mt-4 space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fold laundry"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assign to">
              <select
                value={helperId}
                onChange={(e) => setHelperId(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                {HELPERS.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} · {h.station}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Time">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
          <Field label="House-standard note (optional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Warm water only, fold in thirds."
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Repeat">
            <div className="inline-flex w-full rounded-xl border border-input bg-background p-1">
              {(
                [
                  { key: "none", label: "None" },
                  { key: "daily", label: "Every day" },
                  { key: "weekdays", label: "Specific days" },
                ] as const
              ).map((opt) => {
                const active = repeatKind === opt.key;
                return (
                  <button
                    type="button"
                    key={opt.key}
                    onClick={() => setRepeatKind(opt.key)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-primary text-primary-foreground shadow-soft"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {repeatKind === "weekdays" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const active = days.includes(d);
                  return (
                    <button
                      type="button"
                      key={d}
                      onClick={() => toggleDay(d)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            )}
          </Field>
        </div>
        {isRemote && (
          <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border/70 bg-background/60 p-3">
            <input
              type="checkbox"
              checked={sendLive}
              onChange={(e) => setSendLive(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Send live · urgent</span> — skip
              approval and drop it straight on the board (still attributed to you).
            </span>
          </label>
        )}
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
            {isRemote ? (sendLive ? "Send live" : "Send to on-site manager") : "Add to board"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

// ---------- Rosa's own weekly view ----------
function MyWeekCard({ weekSchedule, simDate }: { weekSchedule: WeekSchedule; simDate: Date }) {
  const todayWd = weekdayOf(simDate);
  const today = weekSchedule[todayWd];
  // Find the next rest day starting from today (0 = today, 1 = tomorrow…).
  const todayIdx = WEEKDAYS.indexOf(todayWd);
  let nextRest: { day: Weekday; inDays: number } | null = null;
  for (let i = 0; i < 7; i++) {
    const d = WEEKDAYS[(todayIdx + i) % 7];
    if (weekSchedule[d].rest) {
      nextRest = { day: d, inDays: i };
      break;
    }
  }
  const restLabel = nextRest
    ? nextRest.inDays === 0
      ? "Today — enjoy your rest"
      : nextRest.inDays === 1
        ? `${WEEKDAY_LONG[nextRest.day]} — tomorrow`
        : `${WEEKDAY_LONG[nextRest.day]} — ${nextRest.inDays} days away`
    : "No rest day set";

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-foreground">My Week</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep">
          <Calendar className="h-3 w-3" /> {WEEKDAY_LONG[todayWd]}
        </span>
      </div>

      {/* Today at a glance */}
      <div className="mt-3 rounded-2xl bg-secondary/60 p-3.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-pine-deep/80">
          Today
        </div>
        {today.rest ? (
          <div className="mt-1 font-display text-lg text-pine-deep">Rest day — salamat, Ate.</div>
        ) : (
          <>
            <div className="mt-1 font-display text-lg text-pine-deep">
              {today.segments.map((s) => `${fmtHM12(s.start)} – ${fmtHM12(s.end)}`).join(" & ")}
            </div>
            {today.breakStart && today.breakEnd && (
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-pine-deep">
                <Moon className="h-3 w-3" /> Break {fmtHM12(today.breakStart)}–
                {fmtHM12(today.breakEnd)}
              </div>
            )}
          </>
        )}
      </div>

      {/* Upcoming rest day */}
      <div className="mt-3 flex items-start gap-2 rounded-2xl border border-terracotta/30 bg-terracotta-soft/40 p-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[oklch(0.55_0.13_60)]" />
        <div className="text-sm text-pine-deep">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-pine-deep/70">
            Rest day
          </div>
          <div className="font-semibold">{restLabel}</div>
        </div>
      </div>

      {/* Week ahead */}
      <div className="mt-4">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Week ahead
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((d, i) => {
            const day = weekSchedule[d];
            const isToday = d === todayWd;
            const rest = day.rest;
            return (
              <div
                key={d}
                className={`flex flex-col items-center rounded-xl border px-1 py-1.5 text-[10px] transition ${
                  isToday
                    ? "border-primary bg-primary text-primary-foreground"
                    : rest
                      ? "border-terracotta/40 bg-terracotta-soft/40 text-[oklch(0.38_0.09_60)]"
                      : "border-border/60 bg-background/40 text-foreground"
                }`}
              >
                <span className="font-semibold uppercase tracking-wider">{d}</span>
                <span className="mt-0.5 leading-tight">
                  {rest
                    ? "Rest"
                    : day.segments[0]
                      ? fmtHM12(day.segments[0].start).replace(" ", "")
                      : "—"}
                </span>
                {!rest && day.segments.length > 1 && (
                  <span
                    className={`text-[9px] ${isToday ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                  >
                    +split
                  </span>
                )}
                <span aria-hidden className="sr-only">
                  {i}
                </span>
              </div>
            );
          })}
        </div>
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
  onAdjustPantry,
  onSetPantryQty,
  onAddPantryItem,
  onRemovePantryItem,
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
  pantry: PantryItem[];
  onAdjustPantry: (id: string, delta: number) => void;
  onSetPantryQty: (id: string, qty: number) => void;
  onAddPantryItem: (item: Omit<PantryItem, "id">) => void;
  onRemovePantryItem: (id: string) => void;
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
          <PantrySection
            items={pantry}
            onAdjust={onAdjustPantry}
            onSetQty={onSetPantryQty}
            onAdd={onAddPantryItem}
            onRemove={onRemovePantryItem}
          />
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

function BlockReasonModal({
  task,
  onClose,
  onSubmit,
}: {
  task: Task;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const suggestions = [
    "No formula left",
    "Need more cash",
    "Waiting on delivery",
    "Sofia is not feeling well",
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl text-foreground">Can't do this now?</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Tell Ma'am briefly — she'll see it right away.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 rounded-2xl bg-secondary/60 px-3 py-2 text-xs text-pine-deep">
          <span className="font-semibold">{task.title}</span> · {task.time}
        </div>
        <div className="mt-3">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. No formula left"
            className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setReason(s)}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onSubmit(reason.trim())}
            disabled={!reason.trim()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground shadow-soft hover:opacity-95 disabled:opacity-50"
          >
            Send to Ma'am
          </button>
        </div>
      </div>
    </div>
  );
}

function NextTaskCard({
  task,
  onUpdate,
  onAskBlock,
}: {
  task: Task;
  onUpdate: (id: string, s: Status, photo?: string) => void;
  onAskBlock: () => void;
}) {
  const [addingPhoto, setAddingPhoto] = useState(false);

  const start = () => onUpdate(task.id, "in_progress");
  const done = () => {
    setAddingPhoto(true);
    setTimeout(() => {
      const photo = PHOTO_POOL[Math.floor(Math.random() * PHOTO_POOL.length)];
      onUpdate(task.id, "done", photo);
      setAddingPhoto(false);
    }, 900);
  };

  return (
    <article className="rounded-3xl border border-border/70 bg-card p-6 shadow-lift">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-foreground">
          {task.status === "in_progress" ? "In progress" : "Up next"}
        </span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-pine-deep">
          {task.time}
        </span>
      </div>
      <h2 className="mt-3 font-display text-2xl leading-tight text-foreground">{task.title}</h2>
      {recurrenceLabel(task.recurrence) && (
        <div className="mt-2">
          <RecurrenceBadge recurrence={task.recurrence} />
        </div>
      )}
      {task.appointmentTitle && (
        <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-2 py-0.5 text-[10px] font-medium text-[oklch(0.38_0.09_60)]">
          <Link2 className="h-2.5 w-2.5" /> {task.appointmentTitle}
        </div>
      )}
      <RescheduleNotice notice={task.rescheduleNotice} newTime={task.time} />

      {task.note && (
        <div className="mt-4 rounded-2xl bg-terracotta-soft/40 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-pine-deep/80">
            House standard
          </div>
          <p className="mt-1 text-sm leading-relaxed text-pine-deep">{task.note}</p>
        </div>
      )}
      {isPalengke(task) && (
        <div className="mt-4">
          <PalengkeInlineList />
        </div>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        {task.status === "todo" ? (
          <button
            onClick={start}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3.5 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
          >
            <Play className="h-4 w-4" /> Start
          </button>
        ) : (
          <button
            onClick={done}
            disabled={addingPhoto}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-sm font-semibold text-accent-foreground shadow-soft transition hover:opacity-95 disabled:opacity-70"
          >
            {addingPhoto ? (
              <>
                <Camera className="h-4 w-4 animate-pulse" /> Attaching photo…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" /> Done · add photo
              </>
            )}
          </button>
        )}
        <button
          onClick={onAskBlock}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-3.5 text-sm font-semibold text-muted-foreground shadow-soft hover:border-accent/60 hover:text-accent-foreground sm:flex-none"
        >
          <HelpCircle className="h-4 w-4" /> Can't now / Need info
        </button>
      </div>
    </article>
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

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${muted ? "text-muted-foreground" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

// ---------- Routines ----------
function RoutinesView({
  routines,
  onAdd,
  onRemove,
}: {
  routines: Routine[];
  onAdd: (r: Omit<Routine, "id" | "station">) => void;
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const byHelper = HELPERS.map((h) => ({
    helper: h,
    items: routines.filter((r) => r.helperId === h.id),
  }));

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Routines
            </div>
            <h1 className="mt-2 font-display text-2xl leading-tight text-foreground sm:text-[28px]">
              Set the rhythm once.
            </h1>
            <p className="mt-2 max-w-lg text-sm text-muted-foreground">
              Recurring tasks live here. On matching days they'll appear on the Pass automatically —
              no need to re-add them each morning.
            </p>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep"
          >
            <Plus className="h-4 w-4" /> New routine
          </button>
        </div>
      </section>

      {routines.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/40 p-10 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-secondary text-pine-deep">
            <Repeat className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            No routines yet. Add one to build the daily rhythm.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {byHelper.map(({ helper, items }) => {
            if (items.length === 0) return null;
            return (
              <section
                key={helper.id}
                className="rounded-3xl border border-border/70 bg-card/60 p-4 sm:p-5"
              >
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={helper.initials} />
                    <div>
                      <div className="text-sm font-semibold text-foreground">{helper.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {helper.station} · {helper.shift}
                      </div>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${stationTone[helper.station]}`}
                  >
                    {items.length} routine{items.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="space-y-2">
                  {items.map((r) => (
                    <RoutineRow key={r.id} routine={r} onRemove={() => onRemove(r.id)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {open && (
        <NewRoutineModal
          onClose={() => setOpen(false)}
          onAdd={(r) => {
            onAdd(r);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function RoutineRow({ routine, onRemove }: { routine: Routine; onRemove: () => void }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">{routine.title}</h4>
            <RecurrenceBadge recurrence={routine.recurrence} />
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">{routine.time}</div>
          {routine.note && (
            <div className="mt-2 rounded-xl bg-terracotta-soft/40 px-2.5 py-1.5 text-xs leading-relaxed text-pine-deep">
              <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-pine-deep/70">
                House standard ·
              </span>
              {routine.note}
            </div>
          )}
        </div>
        <button
          onClick={onRemove}
          aria-label="Remove routine"
          className="rounded-full border border-border p-1.5 text-muted-foreground transition hover:border-accent/60 hover:text-accent-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function NewRoutineModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (r: Omit<Routine, "id" | "station">) => void;
}) {
  const [title, setTitle] = useState("");
  const [helperId, setHelperId] = useState(HELPERS[0].id);
  const [time, setTime] = useState("08:00");
  const [note, setNote] = useState("");
  const [repeatKind, setRepeatKind] = useState<"daily" | "weekdays">("daily");
  const [days, setDays] = useState<Weekday[]>([]);

  const toggleDay = (d: Weekday) => {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const canSubmit = title.trim().length > 0 && (repeatKind === "daily" || days.length > 0);

  const submit = () => {
    if (!canSubmit) return;
    const [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    const recurrence: Exclude<Recurrence, "none"> =
      repeatKind === "daily" ? "daily" : WEEKDAYS.filter((d) => days.includes(d));
    onAdd({
      title: title.trim(),
      helperId,
      time: `${hr}:${String(m).padStart(2, "0")} ${suffix}`,
      note: note.trim() || undefined,
      recurrence,
    });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-xl text-foreground">New routine</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Set it once. It'll appear on the Pass on matching days.
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
              placeholder="e.g. Water the plants"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Assign to">
              <select
                value={helperId}
                onChange={(e) => setHelperId(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              >
                {HELPERS.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} · {h.station}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Time">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
          <Field label="House-standard note (optional)">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Deep-water the fiddle leaf; light mist for the ferns."
              className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <Field label="Repeat">
            <div className="inline-flex w-full rounded-xl border border-input bg-background p-1">
              {(
                [
                  { key: "daily", label: "Every day" },
                  { key: "weekdays", label: "Specific days" },
                ] as const
              ).map((opt) => {
                const active = repeatKind === opt.key;
                return (
                  <button
                    type="button"
                    key={opt.key}
                    onClick={() => setRepeatKind(opt.key)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "bg-primary text-primary-foreground shadow-soft"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {repeatKind === "weekdays" && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {WEEKDAYS.map((d) => {
                  const active = days.includes(d);
                  return (
                    <button
                      type="button"
                      key={d}
                      onClick={() => toggleDay(d)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            )}
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
            disabled={!canSubmit}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
          >
            Save routine
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

// ---------- Appointments ----------
function AppointmentsSection({
  appointments,
  tasks,
  simDate,
  onAdd,
  onRemove,
  onUpdate,
}: {
  appointments: Appointment[];
  tasks: Task[];
  simDate: Date;
  onAdd: (
    a: Omit<Appointment, "id">,
    preps: Array<{ title: string; leadMinutes: number; helperId: string; note?: string }>,
  ) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: { title: string; date: string; time: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const todayIso = toISODate(simDate);
  const upcoming = [...appointments]
    .filter((a) => a.date >= todayIso)
    .sort((a, b) =>
      a.date === b.date
        ? parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
        : a.date < b.date
          ? -1
          : 1,
    );

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              Appointments · {upcoming.length}
            </div>
            <div className="text-xs text-muted-foreground">
              Fixed events. Prep tasks land on the board automatically.
            </div>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-soft hover:bg-primary/5"
        >
          <Plus className="h-3.5 w-3.5" /> New appointment
        </button>
      </div>

      {upcoming.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
          No upcoming appointments. Add one to schedule its prep automatically.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {upcoming.map((a) => {
            const preps = tasks
              .filter((t) => t.appointmentId === a.id)
              .sort(
                (x, y) =>
                  (x.scheduledDate ?? "").localeCompare(y.scheduledDate ?? "") ||
                  parseTimeToMinutes(x.time) - parseTimeToMinutes(y.time),
              );
            return (
              <li key={a.id} className="rounded-2xl border border-border/70 bg-background/60 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <CalendarClock className="h-3 w-3" /> {formatAppointmentDate(a.date)} ·{" "}
                      {a.time}
                    </div>
                    <h4 className="mt-1.5 font-display text-lg text-foreground">{a.title}</h4>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setEditing(a)}
                      className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onRemove(a.id)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label="Remove appointment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {preps.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
                    {preps.map((p) => {
                      const helper = helperById(p.helperId);
                      return (
                        <li key={p.id} className="flex items-start justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground">{p.title}</span>
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${stationTone[p.station]}`}
                              >
                                {p.station}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {formatAppointmentDate(p.scheduledDate ?? a.date)} · {p.time} ·{" "}
                              {helper.short}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <NewAppointmentModal
          onClose={() => setOpen(false)}
          onAdd={(a, preps) => {
            onAdd(a, preps);
            setOpen(false);
          }}
          defaultDate={toISODate(simDate)}
        />
      )}
      {editing && (
        <EditAppointmentModal
          appointment={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            onUpdate(editing.id, patch);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}

// ---------- New appointment modal ----------
type PrepRow = {
  title: string;
  leadValue: number;
  leadUnit: "m" | "h";
  helperId: string;
  note: string;
};

function NewAppointmentModal({
  onClose,
  onAdd,
  defaultDate,
}: {
  onClose: () => void;
  onAdd: (
    a: Omit<Appointment, "id">,
    preps: Array<{ title: string; leadMinutes: number; helperId: string; note?: string }>,
  ) => void;
  defaultDate: string;
}) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("06:00");
  const [preps, setPreps] = useState<PrepRow[]>([
    { title: "", leadValue: 1, leadUnit: "h", helperId: HELPERS[0].id, note: "" },
  ]);

  const applyTemplate = (tmpl: EventTemplate) => {
    setTemplateId(tmpl.id);
    if (!title.trim()) setTitle(tmpl.title);
    setPreps(
      tmpl.preps.map((p) => {
        const useHours = p.leadMinutes % 60 === 0;
        return {
          title: p.title,
          leadValue: useHours ? p.leadMinutes / 60 : p.leadMinutes,
          leadUnit: useHours ? "h" : "m",
          helperId: p.helperId,
          note: p.note,
        };
      }),
    );
  };

  const clearTemplate = () => {
    setTemplateId(null);
    setPreps([{ title: "", leadValue: 1, leadUnit: "h", helperId: HELPERS[0].id, note: "" }]);
  };

  const addRow = () =>
    setPreps((p) => [
      ...p,
      { title: "", leadValue: 1, leadUnit: "h", helperId: HELPERS[0].id, note: "" },
    ]);
  const removeRow = (i: number) => setPreps((p) => p.filter((_, idx) => idx !== i));
  const updateRow = (i: number, patch: Partial<PrepRow>) =>
    setPreps((p) => p.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = () => {
    if (!title.trim()) return;
    const [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    const appTime = `${hr}:${String(m).padStart(2, "0")} ${suffix}`;
    const validPreps = preps
      .filter((r) => r.title.trim())
      .map((r) => ({
        title: r.title.trim(),
        leadMinutes: r.leadUnit === "h" ? r.leadValue * 60 : r.leadValue,
        helperId: r.helperId,
        note: r.note.trim() || undefined,
      }));
    onAdd({ title: title.trim(), date, time: appTime }, validPreps);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl text-foreground">New appointment</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Start from a template
              </span>
              {templateId && (
                <button
                  type="button"
                  onClick={clearTemplate}
                  className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_TEMPLATES.map((tmpl) => {
                const active = templateId === tmpl.id;
                return (
                  <button
                    type="button"
                    key={tmpl.id}
                    onClick={() => applyTemplate(tmpl)}
                    title={tmpl.blurb}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-soft"
                        : "border-border bg-card text-pine-deep hover:border-primary/40"
                    }`}
                  >
                    {tmpl.title}
                  </button>
                );
              })}
            </div>
            {templateId && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Prep loaded from template. House-standard notes come along — tweak below if needed,
                then set the date and time.
              </p>
            )}
          </div>
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sir's flight"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
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
          </div>

          <div className="rounded-2xl border border-border/70 bg-background/60 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Prep tasks
              </span>
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5"
              >
                <Plus className="h-3 w-3" /> Add prep
              </button>
            </div>
            <div className="space-y-3">
              {preps.map((p, i) => (
                <div key={i} className="rounded-xl border border-border/70 bg-card p-2.5">
                  <div className="flex items-start gap-2">
                    <input
                      value={p.title}
                      onChange={(e) => updateRow(i, { title: e.target.value })}
                      placeholder="Prep task title"
                      className="flex-1 rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label="Remove prep"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        How long before
                      </span>
                      <div className="flex gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={p.leadValue}
                          onChange={(e) =>
                            updateRow(i, { leadValue: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="w-16 rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                        />
                        <select
                          value={p.leadUnit}
                          onChange={(e) => updateRow(i, { leadUnit: e.target.value as "m" | "h" })}
                          className="flex-1 rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                        >
                          <option value="m">minutes</option>
                          <option value="h">hours</option>
                        </select>
                      </div>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Assign to
                      </span>
                      <select
                        value={p.helperId}
                        onChange={(e) => updateRow(i, { helperId: e.target.value })}
                        className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-sm outline-none focus:border-primary"
                      >
                        {HELPERS.map((h) => (
                          <option key={h.id} value={h.id}>
                            {h.short} · {h.station}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <textarea
                    value={p.note}
                    onChange={(e) => updateRow(i, { note: e.target.value })}
                    rows={2}
                    placeholder="House-standard note (optional)"
                    className="mt-2 w-full resize-none rounded-lg border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
                  />
                </div>
              ))}
            </div>
          </div>
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
            Save appointment
          </button>
        </div>
      </div>
    </div>
  );
}

function EditAppointmentModal({
  appointment,
  onClose,
  onSave,
}: {
  appointment: Appointment;
  onClose: () => void;
  onSave: (patch: { title: string; date: string; time: string }) => void;
}) {
  const [title, setTitle] = useState(appointment.title);
  const [date, setDate] = useState(appointment.date);
  const [time, setTime] = useState(displayTimeTo24h(appointment.time));

  const submit = () => {
    if (!title.trim()) return;
    const [h, m] = time.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    const appTime = `${hr}:${String(m).padStart(2, "0")} ${suffix}`;
    onSave({ title: title.trim(), date, time: appTime });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-xl text-foreground">Edit appointment</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Prep tasks will move automatically to keep their lead offsets.
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
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
          </div>
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
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Rosa availability ----------
function statusMeta(s: RosaStatus["status"]) {
  if (s === "on_shift")
    return {
      label: "On shift",
      dot: "bg-[oklch(0.68_0.14_150)]",
      cls: "bg-[oklch(0.95_0.05_150)] text-[oklch(0.32_0.1_150)]",
    };
  if (s === "available")
    return {
      label: "Available",
      dot: "bg-accent",
      cls: "bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]",
    };
  return { label: "Off", dot: "bg-muted-foreground/50", cls: "bg-secondary text-muted-foreground" };
}

function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
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

function SimClock({
  nowTs,
  offsetMs,
  onChange,
}: {
  nowTs: number;
  offsetMs: number | null;
  onChange: (v: number | null) => void;
}) {
  const mounted = useMounted();
  const [open, setOpen] = useState(false);
  const jumpTo = (opts: {
    dayOffset?: number;
    toSunday?: boolean;
    hour: number;
    minute?: number;
  }) => {
    const base = new Date();
    if (opts.toSunday) {
      const dow = base.getDay();
      const add = (7 - dow) % 7 || 7; // next Sunday (never today)
      base.setDate(base.getDate() + add);
    } else if (opts.dayOffset) {
      base.setDate(base.getDate() + opts.dayOffset);
    }
    base.setHours(opts.hour, opts.minute ?? 0, 0, 0);
    onChange(base.getTime() - Date.now());
    setOpen(false);
  };
  const isSim = offsetMs !== null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-soft transition sm:text-xs ${
          isSim
            ? "border-accent/50 bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]"
            : "border-border bg-card text-muted-foreground"
        }`}
        title="Simulate the clock for demo"
      >
        <CalendarClock className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap tabular-nums" suppressHydrationWarning>
          {mounted ? formatClock(nowTs) : "—"}
        </span>
        {isSim && <span className="rounded-full bg-accent/20 px-1.5 py-0.5 text-[9px]">SIM</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-2xl border border-border bg-card p-2 shadow-lift">
          <div className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Simulate time
          </div>
          {[
            {
              label: "Real time",
              desc: "Now, live",
              action: () => {
                onChange(null);
                setOpen(false);
              },
            },
            {
              label: "After shift · 7:00 PM",
              desc: "Off-shift auto-off",
              action: () => jumpTo({ hour: 19 }),
            },
            {
              label: "Overnight · 11:00 PM",
              desc: "Quiet hours hard-off",
              action: () => jumpTo({ hour: 23 }),
            },
            {
              label: "Rest day · Sun 10 AM",
              desc: "Off by default all day",
              action: () => jumpTo({ toSunday: true, hour: 10 }),
            },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={opt.action}
              className="flex w-full flex-col items-start rounded-xl px-2.5 py-2 text-left text-xs transition hover:bg-secondary/60"
            >
              <span className="font-semibold text-foreground">{opt.label}</span>
              <span className="text-[10.5px] text-muted-foreground">{opt.desc}</span>
            </button>
          ))}
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

// ---------- After-hours ledger (identical numbers on both sides) ----------
function ledgerEntryMinutes(e: LedgerEntry) {
  return Math.max(0, e.autoMinutes + e.adjustMinutes);
}

function reasonLabel(r: LedgerReason) {
  if (r === "available")
    return { label: "Available", cls: "bg-terracotta-soft/70 text-[oklch(0.38_0.09_60)]" };
  if (r === "emergency")
    return { label: "Emergency", cls: "bg-[oklch(0.95_0.06_35)] text-[oklch(0.42_0.15_30)]" };
  if (r === "rest_day")
    return { label: "Rest day", cls: "bg-[oklch(0.94_0.08_30)] text-[oklch(0.38_0.15_25)]" };
  if (r === "rest_break")
    return { label: "Rest break", cls: "bg-[oklch(0.93_0.05_40)] text-[oklch(0.42_0.12_35)]" };
  return { label: "After shift", cls: "bg-secondary text-pine-deep" };
}

function fmtHoursMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
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

// ---------- Pantry ----------
function PantrySection({
  items,
  onAdjust,
  onSetQty,
  onAdd,
  onRemove,
}: {
  items: PantryItem[];
  onAdjust: (id: string, delta: number) => void;
  onSetQty: (id: string, qty: number) => void;
  onAdd: (item: Omit<PantryItem, "id">) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const lowCount = items.filter((i) => i.qty <= i.par).length;
  const grouped = PANTRY_CATEGORIES.map((cat) => ({
    cat,
    items: items
      .filter((i) => i.category === cat)
      .sort((a, b) => (a.qty <= a.par ? -1 : 1) - (b.qty <= b.par ? -1 : 1)),
  })).filter((g) => g.items.length > 0);

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep">
              <Package className="h-4 w-4" />
            </div>
            <h2 className="font-display text-xl text-foreground">Pantry</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Shared with the Cook. Keep supplies at or above par.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {lowCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft px-2.5 py-1 text-[11px] font-semibold text-[oklch(0.42_0.12_50)]">
              <AlertCircle className="h-3 w-3" /> {lowCount} running low
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep">
              <Check className="h-3 w-3" /> All stocked
            </span>
          )}
          <button
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-soft transition hover:bg-primary/5"
          >
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {grouped.map((g) => (
          <div key={g.cat}>
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {g.cat}
            </div>
            <div className="space-y-2">
              {g.items.map((i) => (
                <PantryRow
                  key={i.id}
                  item={i}
                  onAdjust={onAdjust}
                  onSetQty={onSetQty}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {adding && (
        <AddPantryItemModal
          onClose={() => setAdding(false)}
          onAdd={(item) => {
            onAdd(item);
            setAdding(false);
          }}
        />
      )}
    </section>
  );
}

function PantryRow({
  item,
  onAdjust,
  onSetQty,
  onRemove,
}: {
  item: PantryItem;
  onAdjust: (id: string, delta: number) => void;
  onSetQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
}) {
  const low = item.qty <= item.par;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(item.qty));
  useEffect(() => {
    setDraft(String(item.qty));
  }, [item.qty]);
  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n)) onSetQty(item.id, n);
    setEditing(false);
  };
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border p-2.5 sm:p-3 ${low ? "border-terracotta/40 bg-terracotta-soft/30" : "border-border/70 bg-background/60"}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{item.name}</span>
          {low && (
            <span className="inline-flex shrink-0 items-center rounded-full bg-terracotta px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              Low
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          par {item.par} {item.unit}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={() => onAdjust(item.id, -1)}
          className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition hover:border-primary/40 hover:text-foreground"
          aria-label="Decrease"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") {
                setDraft(String(item.qty));
                setEditing(false);
              }
            }}
            className="w-16 rounded-lg border border-input bg-background px-2 py-1 text-center text-sm tabular-nums outline-none focus:border-primary"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="min-w-[64px] rounded-lg px-2 py-1 text-center text-sm font-semibold tabular-nums text-foreground hover:bg-secondary"
            aria-label={`Edit ${item.name} quantity`}
          >
            {item.qty}{" "}
            <span className="text-[11px] font-normal text-muted-foreground">{item.unit}</span>
          </button>
        )}
        <button
          onClick={() => onAdjust(item.id, 1)}
          className="grid h-8 w-8 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-soft transition hover:border-primary/40 hover:text-foreground"
          aria-label="Increase"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onRemove(item.id)}
          className="ml-1 grid h-8 w-8 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
          aria-label={`Remove ${item.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function AddPantryItemModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (item: Omit<PantryItem, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [par, setPar] = useState("1");
  const [category, setCategory] = useState<PantryCategory>("Pantry");
  const valid = name.trim().length > 0 && !isNaN(parseFloat(qty)) && !isNaN(parseFloat(par));

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-5 shadow-lift sm:p-6">
        <div className="flex items-start justify-between">
          <h3 className="font-display text-xl text-foreground">Add pantry item</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Toilet paper"
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Qty
              </span>
              <input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm tabular-nums outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Unit
              </span>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pcs, kg, L"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Par
              </span>
              <input
                value={par}
                onChange={(e) => setPar(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm tabular-nums outline-none focus:border-primary"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Category
            </span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as PantryCategory)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
            >
              {PANTRY_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            disabled={!valid}
            onClick={() =>
              onAdd({
                name: name.trim(),
                qty: parseFloat(qty),
                unit: unit.trim() || "pcs",
                par: parseFloat(par),
                category,
              })
            }
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function BudgetBar({ compact }: { compact?: boolean } = {}) {
  const ctx = useGrocery();
  if (!ctx) return null;
  const pct = ctx.budget > 0 ? Math.min(100, (ctx.spent / ctx.budget) * 100) : 0;
  const over = ctx.spent > ctx.budget;
  return (
    <div className={compact ? "" : "rounded-2xl bg-background/60 p-3"}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`font-display ${compact ? "text-lg" : "text-2xl"} tabular-nums text-foreground`}
          >
            {fmtPeso(ctx.spent)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            / {fmtPeso(ctx.budget)}
          </span>
        </div>
        <span
          className={`text-[11px] font-semibold tabular-nums ${over ? "text-[oklch(0.5_0.17_35)]" : "text-muted-foreground"}`}
        >
          {over ? `over by ${fmtPeso(ctx.spent - ctx.budget)}` : `${fmtPeso(ctx.remaining)} left`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all ${over ? "bg-[oklch(0.55_0.18_35)]" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ReceiptSlot({ compact }: { compact?: boolean } = {}) {
  const ctx = useGrocery();
  const [preview, setPreview] = useState(false);
  if (!ctx) return null;
  if (ctx.receiptPhoto) {
    return (
      <>
        <div
          className={`flex items-center gap-2 rounded-2xl border border-border/70 bg-background/60 p-2 ${compact ? "" : "sm:p-3"}`}
        >
          <button onClick={() => setPreview(true)} className="shrink-0 overflow-hidden rounded-xl">
            <img src={ctx.receiptPhoto} alt="Receipt" className="h-12 w-12 object-cover" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-foreground">Receipt attached</div>
            <div className="text-[11px] text-muted-foreground">Tap to view</div>
          </div>
          <button
            onClick={ctx.clearReceipt}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
            aria-label="Remove receipt"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {preview && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4"
            onClick={() => setPreview(false)}
          >
            <img
              src={ctx.receiptPhoto}
              alt="Receipt"
              className="max-h-[85vh] rounded-2xl shadow-lift"
            />
          </div>
        )}
      </>
    );
  }
  return (
    <button
      onClick={ctx.attachReceipt}
      className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-background/60 px-3 py-2 text-xs font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground"
    >
      <Camera className="h-3.5 w-3.5" /> Attach receipt photo
    </button>
  );
}

function TodaysSpendDial() {
  const ctx = useGrocery();
  if (!ctx) return null;
  const over = ctx.spent > ctx.budget;
  const pct = ctx.budget > 0 ? Math.min(100, (ctx.spent / ctx.budget) * 100) : 0;
  return (
    <div className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Today's spend
        </div>
        <button
          onClick={ctx.openModal}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
        >
          <Wallet className="h-3 w-3" /> Palengke run
        </button>
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="font-display text-2xl tabular-nums text-foreground">
          {fmtPeso(ctx.spent)}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">/ {fmtPeso(ctx.budget)}</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full ${over ? "bg-[oklch(0.55_0.18_35)]" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <span
          className={`tabular-nums ${over ? "font-semibold text-[oklch(0.5_0.17_35)]" : "text-muted-foreground"}`}
        >
          {over
            ? `over by ${fmtPeso(ctx.spent - ctx.budget)}`
            : `${fmtPeso(ctx.remaining)} remaining`}
        </span>
        {ctx.receiptPhoto ? (
          <button
            onClick={ctx.openModal}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Camera className="h-3 w-3" /> Receipt
          </button>
        ) : (
          <span className="text-muted-foreground/70">No receipt yet</span>
        )}
      </div>
    </div>
  );
}

function PalengkeChip({ compact }: { compact?: boolean } = {}) {
  const ctx = useGrocery();
  if (!ctx) return null;
  return (
    <button
      onClick={ctx.openModal}
      className={`inline-flex items-center gap-1 rounded-full border border-terracotta/50 bg-terracotta-soft/60 font-semibold text-[oklch(0.4_0.13_55)] transition hover:bg-terracotta-soft ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[10px]"
      }`}
      title="Grocery list attached"
    >
      <ShoppingBasket className="h-2.5 w-2.5" />
      Grocery · {ctx.toBuyCount} to buy · {fmtPeso(ctx.spent)}
    </button>
  );
}

function PalengkeInlineList() {
  const ctx = useGrocery();
  if (!ctx) return null;
  const toBuy = ctx.display.filter((g) => !g.bought);
  const bought = ctx.display.filter((g) => g.bought);
  return (
    <div className="rounded-2xl border border-terracotta/40 bg-terracotta-soft/30 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-card text-[oklch(0.4_0.13_55)]">
            <ShoppingBasket className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-pine-deep">Your list · your budget</div>
            <div className="text-[11px] text-muted-foreground">
              {toBuy.length} to buy · {bought.length} bought
            </div>
          </div>
        </div>
        <button
          onClick={ctx.openModal}
          className="rounded-full border border-primary/30 bg-card px-3 py-1 text-[11px] font-semibold text-primary shadow-soft hover:bg-primary/5"
        >
          Open list
        </button>
      </div>

      <div className="mt-3 rounded-2xl bg-card/70 p-3">
        <BudgetBar compact />
      </div>

      {ctx.display.length === 0 ? (
        <p className="mt-3 text-xs italic text-muted-foreground">
          Nothing to buy — pantry is stocked.
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {ctx.display.slice(0, 5).map((g) => (
            <li key={g.id}>
              <GroceryRow
                item={g}
                onToggle={() => ctx.toggleBought(g)}
                onRemove={() => ctx.remove(g)}
                onCost={(c) => ctx.setCost(g, c)}
                tone="light"
              />
            </li>
          ))}
          {ctx.display.length > 5 && (
            <li className="pt-1 text-center text-[11px] text-muted-foreground">
              +{ctx.display.length - 5} more · tap Open list
            </li>
          )}
        </ul>
      )}

      <div className="mt-3">
        <ReceiptSlot compact />
      </div>
    </div>
  );
}

function GrocerySection() {
  const ctx = useGrocery();
  // Hooks stay above the null guard — bailing out first changes hook order between renders.
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [budgetDraft, setBudgetDraft] = useState(String(ctx?.budget ?? 0));
  const budget = ctx?.budget;
  useEffect(() => {
    if (budget !== undefined) setBudgetDraft(String(budget));
  }, [budget]);
  if (!ctx) return null;
  const toBuy = ctx.display.filter((g) => !g.bought);
  const bought = ctx.display.filter((g) => g.bought);
  const submit = () => {
    if (!name.trim()) return;
    const n = parseFloat(qty);
    ctx.addManual(name, isNaN(n) ? 1 : n, unit);
    setName("");
    setQty("1");
    setUnit("pcs");
  };
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-soft sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-terracotta-soft text-[oklch(0.4_0.13_55)]">
              <ShoppingBasket className="h-4 w-4" />
            </div>
            <h2 className="font-display text-xl text-foreground">Grocery list</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Auto-suggested from Pantry lows. Attached to the Palengke run.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold text-pine-deep">
          {toBuy.length} to buy
        </span>
      </div>

      {/* Petty cash / budget */}
      <div className="mt-4 rounded-2xl bg-background/60 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Petty cash budget
          </div>
          <label className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            ₱
            <input
              value={budgetDraft}
              onChange={(e) => setBudgetDraft(e.target.value)}
              onBlur={() => {
                const n = parseFloat(budgetDraft);
                if (!isNaN(n)) ctx.setBudget(n);
                else setBudgetDraft(String(ctx.budget));
              }}
              inputMode="numeric"
              className="w-20 rounded-lg border border-input bg-card px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-primary"
            />
          </label>
        </div>
        <BudgetBar compact />
      </div>

      <div className="mt-4 space-y-2">
        {toBuy.length === 0 && bought.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-background/60 p-4 text-center text-xs text-muted-foreground">
            Pantry is stocked — nothing suggested. Add manual items below.
          </div>
        )}
        {toBuy.map((g) => (
          <GroceryRow
            key={g.id}
            item={g}
            onToggle={() => ctx.toggleBought(g)}
            onRemove={() => ctx.remove(g)}
            onCost={(c) => ctx.setCost(g, c)}
          />
        ))}
      </div>

      {bought.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Bought · {bought.length}
          </div>
          <div className="space-y-1.5">
            {bought.map((g) => (
              <GroceryRow
                key={g.id}
                item={g}
                onToggle={() => ctx.toggleBought(g)}
                onRemove={() => ctx.remove(g)}
                onCost={(c) => ctx.setCost(g, c)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Receipt */}
      <div className="mt-4">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Receipt
        </div>
        <ReceiptSlot />
      </div>

      {/* Add manual */}
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl bg-background/60 p-3">
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Add item
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="e.g. ulam for Sunday"
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="w-16">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Qty
          </span>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-xl border border-input bg-card px-2 py-2 text-center text-sm tabular-nums outline-none focus:border-primary"
          />
        </label>
        <label className="w-20">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Unit
          </span>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="w-full rounded-xl border border-input bg-card px-2 py-2 text-center text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          onClick={submit}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </section>
  );
}

function GroceryRow({
  item,
  onToggle,
  onRemove,
  onCost,
  tone,
}: {
  item: GroceryItem;
  onToggle: () => void;
  onRemove: () => void;
  onCost?: (cost: number | undefined) => void;
  tone?: "light";
}) {
  const suggested = item.id.startsWith("sug-");
  const [draft, setDraft] = useState(item.costPHP != null ? String(item.costPHP) : "");
  useEffect(() => {
    setDraft(item.costPHP != null ? String(item.costPHP) : "");
  }, [item.costPHP]);
  const commit = () => {
    if (!onCost) return;
    if (draft.trim() === "") {
      onCost(undefined);
      return;
    }
    const n = parseFloat(draft);
    if (!isNaN(n) && n >= 0) onCost(n);
  };
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border p-2 ${tone === "light" ? "border-transparent bg-card/70" : "border-border/70 bg-background/60"}`}
    >
      <button
        onClick={onToggle}
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition ${
          item.bought
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-card text-transparent hover:border-primary/60"
        }`}
        aria-label={item.bought ? "Mark not bought" : "Mark bought"}
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={`flex items-center gap-1.5 text-sm ${item.bought ? "text-muted-foreground" : "text-foreground"}`}
        >
          <span className={`truncate font-medium ${item.bought ? "line-through" : ""}`}>
            {item.name}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            · {item.qty} {item.unit}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
          {suggested && !item.bought && (
            <span className="rounded-full bg-secondary px-1.5 py-0.5 font-semibold text-pine-deep">
              Suggested
            </span>
          )}
          {item.pantryItemId && (
            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
              <Package className="h-2.5 w-2.5" /> restocks pantry
            </span>
          )}
        </div>
      </div>
      {item.bought && !suggested && onCost && (
        <label className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-card px-1.5 py-1 text-xs text-muted-foreground focus-within:border-primary">
          <span>₱</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            inputMode="decimal"
            placeholder="—"
            className="w-14 bg-transparent text-right text-sm tabular-nums text-foreground outline-none"
          />
        </label>
      )}
      <button
        onClick={onRemove}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground/70 hover:bg-secondary hover:text-foreground"
        aria-label={`Remove ${item.name}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function GroceryModal({ onClose }: { onClose: () => void }) {
  const ctx = useGrocery();
  if (!ctx) return null;
  const toBuy = ctx.display.filter((g) => !g.bought);
  const bought = ctx.display.filter((g) => g.bought);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-hidden rounded-3xl border border-border bg-card shadow-lift">
        <div className="flex items-start justify-between border-b border-border/60 p-5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Palengke run
            </div>
            <h3 className="mt-1 font-display text-xl text-foreground">Grocery & budget</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {toBuy.length} to buy · {bought.length} bought
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4 space-y-4">
          <div className="rounded-2xl bg-background/60 p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Spent vs. budget
            </div>
            <BudgetBar compact />
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Receipt
            </div>
            <ReceiptSlot />
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              To buy
            </div>
            {toBuy.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                All checked off. Salamat!
              </div>
            ) : (
              <div className="space-y-1.5">
                {toBuy.map((g) => (
                  <GroceryRow
                    key={g.id}
                    item={g}
                    onToggle={() => ctx.toggleBought(g)}
                    onRemove={() => ctx.remove(g)}
                    onCost={(c) => ctx.setCost(g, c)}
                  />
                ))}
              </div>
            )}
          </div>
          {bought.length > 0 && (
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Bought
              </div>
              <div className="space-y-1.5">
                {bought.map((g) => (
                  <GroceryRow
                    key={g.id}
                    item={g}
                    onToggle={() => ctx.toggleBought(g)}
                    onRemove={() => ctx.remove(g)}
                    onCost={(c) => ctx.setCost(g, c)}
                  />
                ))}
              </div>
              <p className="mt-2 px-1 text-[11px] italic text-muted-foreground">
                Enter what each item actually cost. Checking off a suggested item also bumps the
                pantry back up.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
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

// ---------- Suggestions inbox (visible to Primary/Co) ----------
function SuggestionsInbox({
  suggestions,
  onApprove,
  onDismiss,
}: {
  suggestions: Task[];
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  // Group by who suggested it.
  const groups = new Map<string, Task[]>();
  for (const t of suggestions) {
    const key = t.createdBy ?? "A remote admin";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return (
    <section className="rounded-3xl border border-terracotta/40 bg-terracotta-soft/30 p-4 shadow-soft sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-terracotta/20 text-[oklch(0.42_0.15_60)]">
          <HelpCircle className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">
            Suggested by remote admins · {suggestions.length}
          </div>
          <div className="text-xs text-muted-foreground">
            Approve to place on the board, or dismiss quietly.
          </div>
        </div>
      </div>
      <div className="space-y-4">
        {[...groups.entries()].map(([who, items]) => (
          <div key={who}>
            <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-pine-deep">
              From {who}
            </div>
            <div className="space-y-2">
              {items.map((t) => {
                const helper = helperById(t.helperId);
                return (
                  <div
                    key={t.id}
                    className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-foreground">{t.title}</h4>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Avatar initials={helper.initials} />
                          <span className="font-semibold text-foreground">{helper.short}</span>
                          <span>·</span>
                          <span>{t.time}</span>
                        </div>
                        {t.note && <p className="mt-1.5 text-xs text-muted-foreground">{t.note}</p>}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stationTone[t.station]}`}
                      >
                        {t.station}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => onApprove(t.id)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve to board
                      </button>
                      <button
                        onClick={() => onDismiss(t.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" /> Dismiss
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Remote admin's own suggestion tray ----------
function MySuggestions({
  suggestions,
  onWithdraw,
  adminName,
}: {
  suggestions: Task[];
  onWithdraw: (id: string) => void;
  adminName: string;
}) {
  const mine = suggestions.filter((t) => (t.createdBy ?? "") === adminName);
  const others = suggestions.filter((t) => (t.createdBy ?? "") !== adminName);
  if (mine.length === 0 && others.length === 0) return null;
  return (
    <section className="rounded-3xl border border-border/70 bg-card/70 p-4 shadow-soft sm:p-5">
      <div className="mb-2 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep">
          <HelpCircle className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">
            Waiting on the on-site manager
          </div>
          <div className="text-xs text-muted-foreground">
            Your suggestions sit here until Ben or Tina approves them.
          </div>
        </div>
      </div>
      {mine.length === 0 && (
        <p className="rounded-2xl border border-dashed border-border/70 bg-background/60 p-3 text-xs italic text-muted-foreground">
          Nothing pending from you right now.
        </p>
      )}
      <div className="space-y-2">
        {mine.map((t) => {
          const helper = helperById(t.helperId);
          return (
            <div key={t.id} className="rounded-2xl border border-border/70 bg-background/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-foreground">{t.title}</h4>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    For {helper.short} · {t.time}
                  </div>
                </div>
                <button
                  onClick={() => onWithdraw(t.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" /> Withdraw
                </button>
              </div>
            </div>
          );
        })}
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
