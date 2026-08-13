import { Columns3, Moon, Plus, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { RosaStatus } from "@/features/availability/availability.types";
import { RosaStatusChip } from "@/features/availability/components/rosa-status-chip";
import type { ValeRequest } from "@/features/ledger/ledger.types";
import type { Helper, Invite } from "@/features/people/people.types";
import { HelperLane } from "@/features/tasks/components/helper-lane";
import { MySuggestions } from "@/features/tasks/components/my-suggestions";
import { SuggestionsInbox } from "@/features/tasks/components/suggestions-inbox";
import { TheBoardStatusLists } from "@/features/tasks/components/the-board-status-lists";
import type { Task } from "@/features/tasks/task.types";
import { formatSimDate, weekdayOf } from "@/lib/time";

import { NeedsYou } from "./needs-you";
import { RemoteGlance } from "./remote-glance";
import { SpendAndPayday } from "./spend-and-payday";

export type PassMode = "line" | "board";
const PASS_MODE_KEY = "linara.passMode";

export type ManagerPassTabProps = {
  active: Task[];
  suggestions: Task[];
  blocked: Task[];
  pendingVales: ValeRequest[];
  flaggedInvites: Invite[];
  helpers: Helper[];
  activeHelpers: Helper[];
  simDate: Date;
  boardClosed: boolean;
  rosaStatus: RosaStatus;
  helperName: string;
  authorName: string;
  isRemote: boolean;
  canStartNewDay: boolean;
  onStartNewDay: () => void;
  onReschedule: (id: string) => void;
  onDecideVale: (id: string, decision: "approved" | "declined") => void;
  onResolveFlag: (inviteId: string, flagId: string) => void;
  onApproveSuggestion: (id: string) => void;
  onDismissSuggestion: (id: string) => void;
  onNewTask: () => void;
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
  suggestions,
  blocked,
  pendingVales,
  flaggedInvites,
  helpers,
  activeHelpers,
  simDate,
  boardClosed,
  rosaStatus,
  helperName,
  authorName,
  isRemote,
  canStartNewDay,
  onStartNewDay,
  onReschedule,
  onDecideVale,
  onResolveFlag,
  onApproveSuggestion,
  onDismissSuggestion,
  onNewTask,
  view,
  onViewChange,
}: ManagerPassTabProps) {
  // The URL wins when it says which layout to show; otherwise fall back to what
  // this device chose last time.
  const [stored, setStored] = useState<PassMode | null>(null);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(PASS_MODE_KEY);
      if (saved === "board" || saved === "line") setStored(saved);
    } catch {
      // ignore
    }
  }, []);
  const passMode = view ?? stored ?? "line";
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

  return (
    <>
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
        helpers={helpers}
        onReschedule={onReschedule}
        onDecideVale={onDecideVale}
        flaggedInvites={flaggedInvites}
        onResolveFlag={onResolveFlag}
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
              {passMode === "line" ? "The Line" : "The Board"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {passMode === "line"
                ? "Tap a lane to see the full day."
                : "By status, in time order."}
            </p>
          </div>
          <button
            onClick={onNewTask}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep"
          >
            <Plus className="h-3.5 w-3.5" /> New task
          </button>
        </div>
        {passMode === "line" ? (
          <div className="space-y-3">
            {activeHelpers.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No active helpers yet — invite one from People to see their lane here.
              </div>
            ) : (
              activeHelpers.map((h) => (
                <HelperLane
                  key={h.id}
                  helper={h}
                  tasks={active.filter((t) => t.helperId === h.id)}
                />
              ))
            )}
          </div>
        ) : (
          <TheBoardStatusLists tasks={active} helpers={helpers} />
        )}
      </section>

      {/* Compact spend / payday dials */}
      <SpendAndPayday />
    </>
  );
}
