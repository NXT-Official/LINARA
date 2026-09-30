import {
  AlertCircle,
  Check,
  Coins,
  MessageCircle,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

import { Avatar } from "@/components/shared/avatar";
import type { ValeRequest } from "@/features/ledger/ledger.types";
import { stationTone } from "@/features/people/people.constants";
import type { Helper, Invite } from "@/features/people/people.types";
import { findHelper, initialsOf } from "@/features/people/people.utils";
import type { Task } from "@/features/tasks/task.types";
import { taskWhen } from "@/features/tasks/task.utils";

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
}) {
  const [replyId, setReplyId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const flagsCount = flaggedInvites.reduce((s, i) => s + i.flags.length, 0);
  const total = blocked.length + pastDue.length + pendingVales.length + flagsCount;

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
            Stuck or past-due tasks, vale requests, and flagged details.
          </div>
        </div>
      </div>
      <div className="divide-y divide-border/70">
        {blocked.map((t) => {
          const helper = findHelper(t.helperId, helpers);
          const isReplying = replyId === t.id;
          return (
            <div key={t.id} className="py-3.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Avatar initials={helper.initials} />
                    <span className="text-xs font-semibold text-foreground">{helper.short}</span>
                    <span className="text-xs text-muted-foreground">· {taskWhen(t, nowTs)}</span>
                  </div>
                  <h4 className="mt-1.5 text-sm font-semibold text-foreground">{t.title}</h4>
                  <p className="mt-1 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-xs italic text-pine-deep">
                    "{t.blockReason}"
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${stationTone[t.station]}`}
                >
                  {t.station}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setReplyId(isReplying ? null : t.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> Reply
                </button>
                <button
                  onClick={() => {
                    onReschedule(t.id);
                    setReplyId(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
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
                    <span className="text-xs text-muted-foreground">Mock only · not sent</span>
                    <button
                      onClick={() => setReplyId(null)}
                      className="rounded-lg px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {pastDue.map((t) => {
          const helper = findHelper(t.helperId, helpers);
          return (
            <div key={t.id} className="py-3.5 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Avatar initials={helper.initials} />
                    <span className="text-xs font-semibold text-foreground">{helper.short}</span>
                    <span className="text-xs text-muted-foreground">
                      · planned {taskWhen(t, nowTs)}
                    </span>
                  </div>
                  <h4 className="mt-1.5 text-sm font-semibold text-foreground">{t.title}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.routineId
                      ? "Not started. Part of a routine, so cancelling skips just this one."
                      : "Not started yet. Change it, or cancel it if it's no longer needed."}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${stationTone[t.station]}`}
                >
                  {t.station}
                </span>
              </div>
              {onEditTask && onCancelTask && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {confirmCancelId === t.id ? (
                    <>
                      <span className="text-xs text-foreground">
                        Remove it from {helper.short}'s list?
                      </span>
                      <button
                        onClick={() => setConfirmCancelId(null)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      >
                        Keep it
                      </button>
                      <button
                        onClick={() => {
                          onCancelTask(t.id);
                          setConfirmCancelId(null);
                        }}
                        className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground shadow-soft hover:bg-destructive/90"
                      >
                        Yes, cancel it
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => onEditTask(t)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button
                        onClick={() => setConfirmCancelId(t.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Cancel task
                      </button>
                    </>
                  )}
                </div>
              )}
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
                    <span className="text-xs font-semibold text-foreground">{helper.short}</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-xs font-semibold text-accent-foreground">
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
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                >
                  <Check className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  onClick={() => onDecideVale(v.id, "declined")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
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
            const initials = initialsOf(displayName);
            const isSystemCheck = f.field === "wage_below_minimum";
            return (
              <div key={f.id} className="py-3.5 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Avatar initials={initials} />
                      <span className="text-xs font-semibold text-foreground">{displayName}</span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-terracotta/20 px-2 py-0.5 text-xs font-semibold text-[oklch(0.38_0.09_60)]">
                        <AlertCircle className="h-3 w-3" />{" "}
                        {isSystemCheck ? "Compliance check" : "Flagged a detail"}
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
                        ? "Checked when the invite was created"
                        : `Raised by ${displayName}`}{" "}
                      ·{" "}
                      {new Date(f.at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onResolveFlag(inv.id, f.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
                  >
                    <Check className="h-3.5 w-3.5" /> Mark resolved
                  </button>
                  <span className="text-xs text-muted-foreground">
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
