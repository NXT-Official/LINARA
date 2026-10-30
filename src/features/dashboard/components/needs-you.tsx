import {
  AlertCircle,
  Ban,
  CalendarOff,
  Check,
  ChevronDown,
  Coins,
  MessageCircle,
  Pencil,
  RotateCcw,
  Smartphone,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { Avatar } from "@/components/shared/avatar";
import { CappedList } from "@/components/shared/capped-list";
import { LEAVE_KIND_LABEL, LEAVE_REASON_LABEL } from "@/features/leave/leave.constants";
import type { LeaveRequest } from "@/features/leave/leave.types";
import type { ValeRequest } from "@/features/ledger/ledger.types";
import type { Payslip } from "@/features/pay/pay.types";
import { stationTone } from "@/features/people/people.constants";
import type { Helper, Invite } from "@/features/people/people.types";
import { findHelper, initialsOf } from "@/features/people/people.utils";
import type { Task } from "@/features/tasks/task.types";
import { householdTimeZone, parseISODate } from "@/lib/time";
import { taskWhen } from "@/features/tasks/task.utils";
import { useIntlLocale, useT } from "@/lib/i18n/locale-context";

/** What a helper can flag (LINARA_MOBILE's claim screen and My Record), plus the invite-time wage check. */
const FLAG_LABEL: Record<string, string> = {
  wage: "Wage",
  shift: "Shift hours",
  restDay: "Rest day",
  station: "Role / station",
  employment: "Live-in / live-out",
  other: "Something else",
  wage_below_minimum: "Below the regional minimum wage",
};

export function NeedsYou({
  blocked,
  pastDue,
  nowTs,
  onEditTask,
  onCancelTask,
  pendingVales,
  helpers,
  onReschedule,
  onDecideVale,
  flaggedInvites,
  onResolveFlag,
  owedPay = [],
  disputedPayments = [],
  notices = [],
  pendingLeave = [],
  leaveTaskCounts = {},
  onDecideLeave,
}: {
  blocked: Task[];
  /** Still To-do past their planned time (isPastDue). */
  pastDue: Task[];
  nowTs: number;
  /** Both omitted for remote admins -- schedules stay with the on-site managers. */
  onEditTask?: (task: Task) => void;
  onCancelTask?: (taskId: string) => void;
  pendingVales: ValeRequest[];
  helpers: Helper[];
  onReschedule: (id: string) => void;
  onDecideVale: (id: string, decision: "approved" | "declined") => void;
  flaggedInvites: Invite[];
  onResolveFlag: (inviteId: string, flagId: string) => void;
  /** Helpers with pay periods that closed unpaid (or, after leaving, final pay due). */
  owedPay?: { invite: Invite; count: number }[];
  /** Outside-Linara payments she says didn't reach her. */
  disputedPayments?: { payslip: Payslip; name: string; left: boolean }[];
  /** Helpers who gave notice from their app. */
  notices?: Invite[];
  /** Leave she asked for, waiting on a manager. */
  pendingLeave?: LeaveRequest[];
  /** Her unfinished tasks on each pending leave's days, by leave id. */
  leaveTaskCounts?: Record<string, number>;
  /** Absent for remote admins: only on-site managers decide leave. */
  onDecideLeave?: (
    id: string,
    decision: "approved" | "declined",
    opts: { unassignTasks: boolean },
  ) => void;
}) {
  const t = useT();
  const intl = useIntlLocale();
  const [replyId, setReplyId] = useState<string | null>(null);
  // Leave ids whose tasks the manager chose to leave with her.
  const [keepTasks, setKeepTasks] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const flagsCount = flaggedInvites.reduce((s, i) => s + i.flags.length, 0);
  // Two groups, each capped (CappedList): a bad day's stuck tasks can't bury
  // a missed payment, and years of history can't grow the box without end.
  const taskCount = blocked.length + pastDue.length;
  const requestCount =
    disputedPayments.length +
    notices.length +
    owedPay.length +
    pendingVales.length +
    pendingLeave.length +
    flagsCount;
  const total = taskCount + requestCount;

  if (total === 0) {
    return (
      <section className="rounded-3xl border border-dashed border-border bg-card/40 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-pine-deep">
            <Check className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{t("dashboard.needsYou")}</div>
            <div className="text-xs text-muted-foreground">{t("dashboard.allClearNoOneIs")}</div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-terracotta/40 bg-terracotta-soft/40 p-4 shadow-soft sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
          <AlertCircle className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold text-foreground">
            {t("dashboard.needsYouCount", { count: total })}
          </div>
          <div className="text-xs text-muted-foreground">{t("dashboard.stuckOrPastDueTasks")}</div>
        </div>
      </div>
      <div className="space-y-3">
        {taskCount > 0 && (
          <NeedsYouGroup
            id="tasks"
            label={t("dashboard.tasks")}
            count={taskCount}
            noun={["task", "tasks"]}
          >
            {blocked.map((task) => {
              const helper = findHelper(task.helperId, helpers);
              const isReplying = replyId === task.id;
              return (
                <div key={task.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Avatar initials={helper.initials} />
                        <span className="text-xs font-semibold text-foreground">
                          {helper.short}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          · {taskWhen(task, nowTs)}
                        </span>
                      </div>
                      <h4 className="mt-1.5 text-sm font-semibold text-foreground">{task.title}</h4>
                      <p className="mt-1 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
                        "{task.blockReason}"
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${task.helperId ? stationTone(task.station) : "bg-secondary text-muted-foreground"}`}
                    >
                      {task.helperId ? task.station : t("dashboard.unassigned")}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setReplyId(isReplying ? null : task.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> {t("dashboard.reply")}
                    </button>
                    <button
                      onClick={() => {
                        onReschedule(task.id);
                        setReplyId(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> {t("dashboard.reschedule")}
                    </button>
                  </div>
                  {isReplying && (
                    <div className="mt-3 rounded-xl border border-border bg-background p-2">
                      <textarea
                        value={drafts[task.id] ?? ""}
                        onChange={(e) => setDrafts((d) => ({ ...d, [task.id]: e.target.value }))}
                        rows={2}
                        placeholder={`Message ${helper.short}…`}
                        className="w-full resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
                      />
                      <div className="mt-1 flex items-center justify-between px-1">
                        <span className="text-xs text-muted-foreground">
                          {t("dashboard.mockOnlyNotSent")}
                        </span>
                        <button
                          onClick={() => setReplyId(null)}
                          className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                        >
                          {t("dashboard.close")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {pastDue.map((task) => {
              const helper = findHelper(task.helperId, helpers);
              return (
                <div key={task.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Avatar initials={helper.initials} />
                        <span className="text-xs font-semibold text-foreground">
                          {helper.short}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t("dashboard.plannedAt", { when: taskWhen(task, nowTs) })}
                        </span>
                      </div>
                      <h4 className="mt-1.5 text-sm font-semibold text-foreground">{task.title}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {task.routineId
                          ? t("dashboard.notStartedRoutine")
                          : t("dashboard.notStartedYet")}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${task.helperId ? stationTone(task.station) : "bg-secondary text-muted-foreground"}`}
                    >
                      {task.helperId ? task.station : t("dashboard.unassigned")}
                    </span>
                  </div>
                  {onEditTask && onCancelTask && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {confirmCancelId === task.id ? (
                        <>
                          <span className="text-xs text-foreground">
                            {t("dashboard.cancelItItStaysOn")}
                          </span>
                          <button
                            onClick={() => setConfirmCancelId(null)}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                          >
                            {t("dashboard.keepIt")}
                          </button>
                          <button
                            onClick={() => {
                              onCancelTask(task.id);
                              setConfirmCancelId(null);
                            }}
                            className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground shadow-soft hover:bg-destructive/90"
                          >
                            {t("dashboard.yesCancelIt")}
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => onEditTask(task)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                          >
                            <Pencil className="h-3.5 w-3.5" /> {t("dashboard.edit")}
                          </button>
                          <button
                            onClick={() => setConfirmCancelId(task.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive"
                          >
                            <Ban className="h-3.5 w-3.5" /> {t("dashboard.cancelTask")}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </NeedsYouGroup>
        )}
        {requestCount > 0 && (
          <NeedsYouGroup
            id="requests"
            label={t("dashboard.requestsAndPay")}
            count={requestCount}
            noun={["item", "items"]}
          >
            {disputedPayments.map(({ payslip, name, left }) => (
              <div key={`disputed-${payslip.id}`} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2">
                  <Avatar initials={initialsOf(name)} />
                  <span className="text-xs font-semibold text-foreground">{name}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                    <AlertCircle className="h-3 w-3" /> {t("dashboard.saysItDidnTArrive")}
                  </span>
                </div>
                <h4 className="mt-1.5 text-sm font-semibold text-foreground">
                  {payslip.kind === "thirteenth_month"
                    ? t("dashboard.thirteenthMonthYear", { year: payslip.cutoffEnd.slice(0, 4) })
                    : t("dashboard.payForRange", {
                        from: payslip.cutoffStart.slice(5),
                        to: payslip.cutoffEnd.slice(5),
                      })}
                  {t("dashboard.recordedOutside")}
                </h4>
                {payslip.helperAckNote && (
                  <p className="mt-1 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
                    "{payslip.helperAckNote}"
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link
                    {...(left
                      ? { to: "/manager/people" as const }
                      : { to: "/manager/money" as const, search: { helper: payslip.helperId } })}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                  >
                    {t("dashboard.reviewThePayment")}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {t("dashboard.talkItThrough", { name })}
                  </span>
                </div>
              </div>
            ))}
            {notices.map((inv) => {
              const displayName = inv.claimedName || inv.name;
              return (
                <div key={`notice-${inv.id}`} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Avatar initials={initialsOf(displayName)} />
                    <span className="text-xs font-semibold text-foreground">{displayName}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-semibold text-terracotta-ink">
                      {t("dashboard.gaveNotice")}
                    </span>
                  </div>
                  <h4 className="mt-1.5 text-sm font-semibold text-foreground">
                    {t("dashboard.lastDay")}{" "}
                    {inv.noticeLastDay
                      ? new Date(`${inv.noticeLastDay}T00:00:00`).toLocaleDateString(intl, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </h4>
                  {inv.noticeNote && (
                    <p className="mt-1 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
                      "{inv.noticeNote}"
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link
                      to="/manager/people"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                    >
                      {t("dashboard.endEmploymentOnThatDay")}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {t("dashboard.inPeopleFinalPayAnd")}
                    </span>
                  </div>
                </div>
              );
            })}
            {owedPay.map(({ invite: inv, count }) => {
              const displayName = inv.claimedName || inv.name;
              const left = inv.status === "ended";
              return (
                <div key={`owed-${inv.id}`} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Avatar initials={initialsOf(displayName)} />
                    <span className="text-xs font-semibold text-foreground">{displayName}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-terracotta/20 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                      <Coins className="h-3 w-3" />{" "}
                      {left ? t("dashboard.leftStillOwed") : t("dashboard.unpaidPeriod")}
                    </span>
                  </div>
                  <h4 className="mt-1.5 text-sm font-semibold text-foreground">
                    {t("dashboard.periodsNoPayment", { count })}
                  </h4>
                  <div className="mt-3">
                    {/* Opens Money on HER, at her unpaid periods: GCash or Maya,
                        or record it as paid outside Linara (KNOWN_GAPS O35). */}
                    <Link
                      {...(left
                        ? { to: "/manager/people" as const }
                        : { to: "/manager/money" as const, search: { helper: inv.id } })}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                    >
                      <Smartphone className="h-3.5 w-3.5" /> {t("dashboard.payByGcashOrMaya")}
                    </Link>
                  </div>
                </div>
              );
            })}
            {pendingVales.map((v) => {
              const helper = findHelper(v.helperId, helpers);
              return (
                <div key={v.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Avatar initials={helper.initials} />
                        <span className="text-xs font-semibold text-foreground">
                          {helper.short}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                          <Coins className="h-3 w-3" /> {t("dashboard.valeRequest")}
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
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                    >
                      <Check className="h-3.5 w-3.5" /> {t("dashboard.approve")}
                    </button>
                    <button
                      onClick={() => onDecideVale(v.id, "declined")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" /> {t("dashboard.decline")}
                    </button>
                  </div>
                </div>
              );
            })}
            {pendingLeave.map((l) => {
              const helper = findHelper(l.helperId, helpers);
              const taskCount = leaveTaskCounts[l.id] ?? 0;
              const unassignTasks = taskCount > 0 && !keepTasks[l.id];
              return (
                <div key={l.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Avatar initials={helper.initials} />
                    <span className="text-xs font-semibold text-foreground">{helper.short}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                      <CalendarOff className="h-3 w-3" /> {LEAVE_KIND_LABEL[l.kind]}
                    </span>
                  </div>
                  <h4 className="mt-1.5 text-sm font-semibold text-foreground">
                    {t("dashboard.leaveDays", { dates: leaveDates(l), count: l.days })}
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {LEAVE_REASON_LABEL[l.reason]}
                    {l.note ? ` · "${l.note}"` : ""}
                  </p>
                  {onDecideLeave && taskCount > 0 && (
                    <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={unassignTasks}
                        onChange={(e) =>
                          setKeepTasks((prev) => ({ ...prev, [l.id]: !e.target.checked }))
                        }
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span>
                        <span className="font-semibold text-foreground">
                          {t("dashboard.tasksOnThoseDays", {
                            count: taskCount,
                            name: helper.short,
                          })}
                        </span>{" "}
                        {t("dashboard.moveToUnassigned", { count: taskCount })}
                      </span>
                    </label>
                  )}
                  {onDecideLeave && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => onDecideLeave(l.id, "approved", { unassignTasks })}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                      >
                        <Check className="h-3.5 w-3.5" /> {t("dashboard.approve")}
                      </button>
                      <button
                        onClick={() => onDecideLeave(l.id, "declined", { unassignTasks: false })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" /> {t("dashboard.decline")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {flaggedInvites.map((inv) =>
              inv.flags.map((f) => {
                const displayName = inv.claimedName || inv.name;
                const initials = initialsOf(displayName);
                const isSystemCheck = f.field === "wage_below_minimum";
                return (
                  <div key={f.id} className="py-3.5 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Avatar initials={initials} />
                          <span className="text-xs font-semibold text-foreground">
                            {displayName}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-terracotta/20 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                            <AlertCircle className="h-3 w-3" />{" "}
                            {isSystemCheck
                              ? t("dashboard.complianceCheck")
                              : t("dashboard.flaggedDetail")}
                          </span>
                        </div>
                        <h4 className="mt-1.5 text-sm font-semibold text-foreground">
                          {FLAG_LABEL[f.field] ?? f.field}
                        </h4>
                        {f.note && (
                          <p className="mt-1 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
                            "{f.note}"
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {isSystemCheck
                            ? t("dashboard.checkedAtInvite")
                            : t("dashboard.raisedBy", { name: displayName })}{" "}
                          ·{" "}
                          {new Date(f.at).toLocaleDateString(intl, {
                            month: "short",
                            day: "numeric",
                            timeZone: householdTimeZone(),
                          })}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => onResolveFlag(inv.id, f.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                      >
                        <Check className="h-3.5 w-3.5" /> {t("dashboard.markResolved")}
                      </button>
                      <span className="text-xs text-muted-foreground">
                        {t("dashboard.updateTheHouseholdRecordIn")}
                      </span>
                    </div>
                  </div>
                );
              }),
            )}
          </NeedsYouGroup>
        )}
      </div>
    </section>
  );
}

/**
 * One group in Needs You: its own panel, with a header that minimizes it.
 * Whether it's minimized is remembered in this browser only (a viewing
 * preference, not shared state), and read after mount so the server render
 * and the first client render agree.
 */
function NeedsYouGroup({
  id,
  label,
  count,
  noun,
  children,
}: {
  id: string;
  label: string;
  count: number;
  noun: [string, string];
  children: ReactNode;
}) {
  const storageKey = `linara_needs_you_minimized_${id}`;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(storageKey) === "1") setOpen(false);
    } catch {
      // Storage blocked: every group just starts open.
    }
  }, [storageKey]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(storageKey, next ? "0" : "1");
    } catch {
      // Not remembered, still toggled.
    }
  };

  const panelId = `needs-you-${id}`;
  return (
    <div className="rounded-2xl bg-card/85 ring-1 ring-border/40">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 rounded-2xl px-4 py-3 text-left font-sans outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-sm tabular-nums text-muted-foreground">{count}</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div id={panelId} className="border-t border-border/50 px-4 py-3.5">
          <CappedList noun={noun} className="divide-y divide-border/70">
            {children}
          </CappedList>
        </div>
      )}
    </div>
  );
}

const shortDate = (iso: string) =>
  parseISODate(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

/** "Mon, Oct 5" or "Mon, Oct 5 – Wed, Oct 7". */
const leaveDates = (l: LeaveRequest) =>
  l.startDate === l.endDate
    ? shortDate(l.startDate)
    : `${shortDate(l.startDate)} – ${shortDate(l.endDate)}`;
