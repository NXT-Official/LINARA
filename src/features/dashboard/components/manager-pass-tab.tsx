import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Moon,
  Plus,
  Rows3,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { RosaStatus } from "@/features/availability/availability.types";
import { RosaStatusChip } from "@/features/availability/components/rosa-status-chip";
import type { LeaveRequest } from "@/features/leave/leave.types";
import type { ValeRequest } from "@/features/ledger/ledger.types";
import type { Payslip } from "@/features/pay/pay.types";
import type { Helper, Invite } from "@/features/people/people.types";
import { UNASSIGNED_HELPER } from "@/features/people/people.utils";
import { HelperLane } from "@/features/tasks/components/helper-lane";
import { RollCall } from "@/features/tasks/components/roll-call";
import { attentionRank, laneSummary, type LaneSummary } from "@/features/tasks/lane.utils";
import { StaffScopeBar } from "@/features/teams/components/staff-scope-bar";
import { TeamGroup } from "@/features/teams/components/team-group";
import { useStaffScope } from "@/features/teams/hooks/use-staff-scope";
import { useTeamView } from "@/features/teams/hooks/use-team-view";
import { LARGE_STAFF } from "@/features/teams/teams.constants";
import { MySuggestions } from "@/features/tasks/components/my-suggestions";
import { SuggestionsInbox } from "@/features/tasks/components/suggestions-inbox";
import { TheBoardStatusLists } from "@/features/tasks/components/the-board-status-lists";
import type { Task } from "@/features/tasks/task.types";
import { useMounted } from "@/hooks/use-mounted";
import { formatSimDate } from "@/lib/time";

import { NeedsYou } from "./needs-you";
import { RemoteGlance } from "./remote-glance";
import { SpendAndPayday } from "./spend-and-payday";

export type PassMode = "line" | "board" | "roll";
const PASS_MODE_KEY = "linara.passMode";

export type ManagerPassTabProps = {
  /** Today's tasks, including ones carried over from earlier days. */
  active: Task[];
  /** Scheduled for a later day: shown as "Coming up", never counted today. */
  upcoming: Task[];
  suggestions: Task[];
  blocked: Task[];
  pastDue: Task[];
  nowTs: number;
  pendingVales: ValeRequest[];
  flaggedInvites: Invite[];
  owedPay: { invite: Invite; count: number }[];
  disputedPayments: { payslip: Payslip; name: string; left: boolean }[];
  notices: Invite[];
  pendingLeave: LeaveRequest[];
  /** Absent for remote admins. */
  leaveTaskCounts?: Record<string, number>;
  onDecideLeave?: (
    id: string,
    decision: "approved" | "declined",
    opts: { unassignTasks: boolean },
  ) => void;
  helpers: Helper[];
  activeHelpers: Helper[];
  /** The day shown: today, or one picked with the arrows. */
  shownDate: Date;
  isToday: boolean;
  /** Another day's tasks are still loading. */
  dayLoading: boolean;
  onShiftDay: (days: number) => void;
  onToday: () => void;
  boardClosed: boolean;
  rosaStatus: RosaStatus;
  helperName: string;
  /** With more than one helper: how many are on shift now, in place of one helper's chip. */
  onShift?: { on: number; total: number };
  authorName: string;
  isRemote: boolean;
  /** Primary and co-managers. */
  canEndDay: boolean;
  /** Ask to end the day (confirmed in a modal). */
  onEndDay: () => void;
  onReopenDay: () => void;
  onReschedule: (id: string) => void;
  onEditTask: (task: Task) => void;
  onCancelTask: (id: string) => void;
  onDecideVale: (id: string, decision: "approved" | "declined") => void;
  onResolveFlag: (inviteId: string, flagId: string) => void;
  onApproveSuggestion: (id: string) => void;
  onDismissSuggestion: (id: string) => void;
  onNewTask: () => void;
  /** Quick Utos: a small ask, right now. Today's business, so it lives here. */
  quickUtos?: ReactNode;
  /** Layout from the URL (`?view=`), or undefined to use this device's last choice. */
  view: PassMode | undefined;
  onViewChange: (mode: PassMode) => void;
};

/**
 * The Pass: today at a glance, whatever needs a decision, and the day itself —
 * either as per-helper lanes (The Line) or grouped by status (The Board). The
 * chosen layout sticks per device.
 */
export function ManagerPassTab({
  active,
  upcoming,
  suggestions,
  blocked,
  pastDue,
  nowTs,
  pendingVales,
  flaggedInvites,
  owedPay,
  disputedPayments,
  notices,
  pendingLeave,
  leaveTaskCounts,
  onDecideLeave,
  helpers,
  activeHelpers,
  shownDate,
  isToday,
  dayLoading,
  onShiftDay,
  onToday,
  boardClosed,
  rosaStatus,
  helperName,
  onShift,
  authorName,
  isRemote,
  canEndDay,
  onEndDay,
  onReopenDay,
  onReschedule,
  onEditTask,
  onCancelTask,
  onDecideVale,
  onResolveFlag,
  onApproveSuggestion,
  onDismissSuggestion,
  onNewTask,
  quickUtos,
  view,
  onViewChange,
}: ManagerPassTabProps) {
  // The URL wins when it says which layout to show; otherwise fall back to what
  // this device chose last time.
  const [stored, setStored] = useState<PassMode | null>(null);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PASS_MODE_KEY);
      if (saved === "board" || saved === "line" || saved === "roll") setStored(saved);
    } catch {
      // ignore
    }
  }, []);
  // A large staff opens on Roll call (a line each) rather than a lane each.
  const passMode = view ?? stored ?? (activeHelpers.length > LARGE_STAFF ? "roll" : "line");
  const navigate = useNavigate();
  const mounted = useMounted();
  const openPlan = (day: string) => void navigate({ to: "/manager/schedule", search: { day } });
  const updatePassMode = (m: PassMode) => {
    try {
      window.localStorage.setItem(PASS_MODE_KEY, m);
    } catch {
      // ignore
    }
    onViewChange(m);
  };

  const counts = useMemo(
    () => ({
      done: active.filter((t) => t.status === "done").length,
      inProg: active.filter((t) => t.status === "in_progress").length,
      todo: active.filter((t) => t.status === "todo" || t.status === "blocked").length,
    }),
    [active],
  );
  // Who the Line, Roll call and Board show: everyone, or the team, labels or
  // name the manager narrowed to (useStaffScope). Tasks nobody has yet show
  // only while nothing is narrowed: they belong to no team.
  const staff = useStaffScope();
  const { teams } = useTeamView();
  const filtering = staff.scoped || staff.scope.query.trim() !== "";
  const shownHelpers = staff.apply(activeHelpers);
  const shownIds = new Set(shownHelpers.map((h) => h.id));
  const inScope = (t: Task) => !filtering || (t.helperId !== null && shownIds.has(t.helperId));
  const scopedActive = active.filter(inScope);
  const scopedUpcoming = upcoming.filter(inScope);
  const todayOf = (id: string) => scopedActive.filter((t) => t.helperId === id);
  const laterOf = (id: string) => scopedUpcoming.filter((t) => t.helperId === id);
  const summaries = new Map<string, LaneSummary>(
    shownHelpers.map((h) => [h.id, laneSummary(todayOf(h.id), nowTs)]),
  );
  const large = shownHelpers.length > LARGE_STAFF;
  // A large staff reads top-down by what needs you (a stable sort: same order otherwise).
  const ordered = large
    ? [...shownHelpers].sort(
        (a, b) => attentionRank(summaries.get(a.id)!) - attentionRank(summaries.get(b.id)!),
      )
    : shownHelpers;
  const groups = staff.group(ordered);
  const teamNameOf = (h: Helper) =>
    groups || !h.teamId ? null : (teams.teamById.get(h.teamId)?.name ?? null);

  const people = (list: Helper[]) =>
    passMode === "roll" ? (
      <RollCall
        helpers={list}
        summaries={summaries}
        upcomingFor={laterOf}
        teamNameOf={teamNameOf}
        nowTs={nowTs}
        onOpenTask={isRemote ? undefined : onEditTask}
        onOpenPlan={openPlan}
      />
    ) : (
      <div className="space-y-3">
        {list.map((h) => (
          <HelperLane
            key={h.id}
            helper={h}
            tasks={todayOf(h.id)}
            upcoming={laterOf(h.id)}
            nowTs={nowTs}
            onOpenTask={isRemote ? undefined : onEditTask}
            onOpenPlan={openPlan}
          />
        ))}
      </div>
    );

  // Only say something the counts above don't already say. Anything waiting
  // on a decision is Needs You's job, directly below.
  const dayNote = dayLoading
    ? "Loading that day…"
    : !isToday
      ? active.length === 0
        ? "Nothing planned that day."
        : null
      : boardClosed
        ? "The day is done. Anything you add for today waits until it reopens."
        : active.length === 0
          ? "Nothing on today's board yet."
          : counts.done === active.length
            ? "Everything on today's board is done."
            : null;
  const dayBtn =
    "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground";

  return (
    <>
      <div className="flex items-center justify-end gap-3">
        <div
          className="inline-flex rounded-xl border border-border bg-card p-1 shadow-soft"
          role="group"
          aria-label="Pass layout"
        >
          {[
            { key: "line" as const, label: "The Line", Icon: Users },
            { key: "roll" as const, label: "Roll call", Icon: Rows3 },
            { key: "board" as const, label: "The Board", Icon: Columns3 },
          ].map(({ key, label, Icon }) => {
            const active = passMode === key;
            return (
              <button
                key={key}
                onClick={() => updatePassMode(key)}
                aria-pressed={active}
                // Named, not icons alone: three pictograms didn't say what
                // they switched between (UX review 2026-10-07).
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${
                  active
                    ? "bg-primary text-primary-foreground shadow-soft"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Status line */}
      <section className="rounded-3xl bg-card p-5 shadow-soft sm:p-7">
        {/* Wraps on a phone: the date keeps its own line, and the day's
            actions go under it instead of printing over it. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={() => onShiftDay(-1)}
              aria-label="Previous day"
              className={dayBtn}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {/* The date, once. It used to appear three times: a "The Pass ·
                Today" eyebrow, a date pill, and the weekday again below. */}
            {/* "October 7" stays on one line: on a phone the day was wrapping
                onto a line of its own. */}
            <h2 className="min-w-0 text-balance font-display text-xl leading-tight text-foreground sm:text-2xl">
              {formatSimDate(shownDate).replace(/ (\d+)$/, "\u00a0$1")}
            </h2>
            <button
              type="button"
              onClick={() => onShiftDay(1)}
              aria-label="Next day"
              className={dayBtn}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isToday && (
              <button
                type="button"
                onClick={onToday}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-soft transition hover:bg-primary/5"
              >
                Back to today
              </button>
            )}
            {isToday && boardClosed && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                <Moon className="h-3 w-3" /> Day ended
              </span>
            )}
            {isToday && canEndDay && (
              <button
                type="button"
                onClick={boardClosed ? onReopenDay : onEndDay}
                className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                {boardClosed ? "Reopen today" : "End the day"}
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className="h-2 w-2 rounded-full bg-status-done" />
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
            <span className="text-muted-foreground">to do</span>
          </span>
          <span className="ml-auto">
            {onShift ? (
              // The count depends on the clock: shown once mounted, like the
              // single-helper chip, so the server's render doesn't disagree.
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-status-done-soft px-2.5 py-1 text-xs font-semibold text-status-done-ink"
                suppressHydrationWarning
              >
                <span className="h-1.5 w-1.5 rounded-full bg-status-done" />
                <span className="tabular-nums">
                  {mounted ? `${onShift.on} of ${onShift.total}` : "—"}
                </span>{" "}
                on shift
              </span>
            ) : (
              <RosaStatusChip status={rosaStatus} helperName={helperName} />
            )}
          </span>
        </div>
        {dayNote && <p className="mt-2 text-sm text-muted-foreground">{dayNote}</p>}
      </section>

      {/* Needs you */}
      <NeedsYou
        blocked={blocked}
        pastDue={pastDue}
        nowTs={nowTs}
        onEditTask={isRemote ? undefined : onEditTask}
        onCancelTask={isRemote ? undefined : onCancelTask}
        pendingVales={pendingVales}
        helpers={helpers}
        onReschedule={onReschedule}
        onDecideVale={onDecideVale}
        flaggedInvites={flaggedInvites}
        onResolveFlag={onResolveFlag}
        owedPay={owedPay}
        disputedPayments={disputedPayments}
        notices={notices}
        pendingLeave={pendingLeave}
        leaveTaskCounts={leaveTaskCounts}
        onDecideLeave={onDecideLeave}
      />

      {/* Remote-admin OFW glance */}
      {isRemote && <RemoteGlance active={active} helperName={helperName} adminName={authorName} />}

      {/* Suggestions from remote admins (approve onto the board) */}
      {!isRemote && suggestions.length > 0 && (
        <SuggestionsInbox
          suggestions={suggestions}
          helpers={helpers}
          onApprove={onApproveSuggestion}
          onDismiss={onDismissSuggestion}
        />
      )}
      {isRemote && suggestions.length > 0 && (
        <MySuggestions
          suggestions={suggestions}
          helpers={helpers}
          onWithdraw={onDismissSuggestion}
          adminName={authorName}
        />
      )}

      {/* The Pass — Line or Board */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 px-1">
          <div>
            <h2 className="font-display text-xl text-foreground">
              {passMode === "line" ? "The Line" : passMode === "roll" ? "Roll call" : "The Board"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {passMode === "line"
                ? "Tap a lane to see the full day."
                : passMode === "roll"
                  ? "A line each. Tap someone to see their day."
                  : "By status, in time order."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* The Pass is today; planning the week or month happens on Schedule. */}
            <Link
              to="/manager/schedule"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-primary shadow-soft transition hover:bg-secondary/60"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Plan ahead
            </Link>
            <button
              onClick={onNewTask}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep"
            >
              <Plus className="h-3.5 w-3.5" /> New task
            </button>
          </div>
        </div>
        <StaffScopeBar api={staff} shown={shownHelpers.length} total={activeHelpers.length} />
        {passMode !== "board" ? (
          <div className="space-y-3">
            {/* Tasks nobody has yet: managers only, until one is assigned (tap a task). */}
            {!filtering &&
              (active.some((t) => t.helperId === null) ||
                upcoming.some((t) => t.helperId === null)) && (
                <HelperLane
                  unassigned
                  helper={UNASSIGNED_HELPER}
                  tasks={active.filter((t) => t.helperId === null)}
                  upcoming={upcoming.filter((t) => t.helperId === null)}
                  nowTs={nowTs}
                  onOpenTask={isRemote ? undefined : onEditTask}
                  onOpenPlan={openPlan}
                />
              )}
            {activeHelpers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No active helpers yet — invite one from People to see their lane here.
              </div>
            ) : shownHelpers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                Nobody matches. Try another name, team or label.
              </div>
            ) : groups ? (
              groups.map((g) => {
                const sums = g.items.map((h) => summaries.get(h.id)!);
                const done = sums.reduce((n, x) => n + x.done, 0);
                const total = sums.reduce((n, x) => n + x.total, 0);
                const attention = sums.reduce((n, x) => n + x.overdueIds.size, 0);
                return (
                  <TeamGroup
                    key={g.key}
                    title={g.title}
                    count={g.items.length}
                    summary={total === 0 ? "Nothing today" : `${done} of ${total} done`}
                    attention={attention}
                    defaultOpen={groups.length === 1 || !large}
                  >
                    {people(g.items)}
                  </TeamGroup>
                );
              })
            ) : (
              people(ordered)
            )}
          </div>
        ) : (
          <TheBoardStatusLists
            tasks={scopedActive}
            upcoming={scopedUpcoming}
            helpers={helpers}
            nowTs={nowTs}
            onOpenTask={isRemote ? undefined : onEditTask}
            onOpenPlan={openPlan}
          />
        )}
      </section>

      {quickUtos}

      {/* Compact spend / payday dials */}
      <SpendAndPayday />
    </>
  );
}
