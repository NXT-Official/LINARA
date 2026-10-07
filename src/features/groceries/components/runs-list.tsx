import { CalendarClock, Loader2, Plus } from "lucide-react";
import { useState } from "react";

import { useAppStores } from "@/features/dashboard/app-store-context";
import { shortNameOf } from "@/features/people/people.utils";

import { useGrocery } from "../grocery-context";
import type { GroceryRun, RunStatus } from "../grocery.types";
import {
  WEEKDAYS,
  fmtPeso,
  nextDue,
  progress,
  shortDate,
  sortOpenRuns,
  spentOn,
} from "../grocery.utils";
import { RunStatusPill } from "./run-status-pill";

const GROUPS: { status: RunStatus; label: string }[] = [
  { status: "pending", label: "Waiting for your approval" },
  { status: "ready", label: "Ready to shop" },
  { status: "draft", label: "Drafts" },
];

/**
 * The open runs, in the order they need someone: waiting for approval, ready
 * to shop, drafts. Repeats due in the next two days sit on top with a Start
 * button. With teams, a filter narrows it to one team's runs.
 */
export function RunsList({
  onOpen,
  onNew,
}: {
  onOpen: (runId: string) => void;
  onNew: () => void;
}) {
  const ctx = useGrocery();
  const { teams } = useAppStores();
  const [team, setTeam] = useState("all");
  const [starting, setStarting] = useState<string | null>(null);
  const hasTeams = teams.available && teams.teams.length > 0;

  const due = ctx.templates.flatMap((t) => {
    const d = nextDue(t, new Date());
    return d && d.daysAway <= 2 ? [{ t, d }] : [];
  });
  const runs = sortOpenRuns(ctx.runs).filter(
    (r) => team === "all" || (team === "none" ? r.teamId === null : r.teamId === team),
  );

  const start = async (id: string, date: string) => {
    setStarting(id);
    try {
      onOpen(await ctx.startTemplate(id, date));
    } catch {
      // useGroceryList already said what went wrong.
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {hasTeams ? (
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            aria-label="Show runs for"
            className="min-w-0 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="all">Every team</option>
            {teams.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="none">No team</option>
          </select>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-1 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
        >
          <Plus className="h-3.5 w-3.5" /> New run
        </button>
      </div>

      {due.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-2xl bg-terracotta-soft/40 px-3">
          {due.map(({ t, d }) => (
            <li key={t.id} className="flex items-center gap-3 py-2.5">
              <CalendarClock className="h-4 w-4 shrink-0 text-terracotta-ink" />
              <span className="min-w-0 flex-1 text-sm text-foreground">
                <span className="font-semibold">{t.title}</span> is due{" "}
                {d.daysAway === 0
                  ? "today"
                  : d.daysAway === 1
                    ? "tomorrow"
                    : WEEKDAYS[t.weekday ?? 0]}
              </span>
              <button
                type="button"
                disabled={starting !== null}
                onClick={() => void start(t.id, d.date)}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-primary ring-1 ring-primary/30 hover:bg-primary/5 disabled:opacity-50"
              >
                {starting === t.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Start
              </button>
            </li>
          ))}
        </ul>
      )}

      {runs.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          {ctx.runs.length === 0
            ? "No runs open. Make one from what's in Needed, or start a repeat."
            : "No open runs for that team."}
        </p>
      ) : (
        GROUPS.map(({ status, label }) => {
          const list = runs.filter((r) => r.status === status);
          if (list.length === 0) return null;
          return (
            <div key={status}>
              <div className="px-1 text-xs font-semibold text-muted-foreground">
                {label} · {list.length}
              </div>
              <ul className="divide-y divide-border/70">
                {list.map((r) => (
                  <li key={r.id}>
                    <RunRow run={r} onOpen={() => onOpen(r.id)} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </div>
  );
}

/** One run: what, when, who, how far along and what it cost against the cash. */
export function RunRow({ run, onOpen }: { run: GroceryRun; onOpen: () => void }) {
  const ctx = useGrocery();
  const { teams, activeHelpers, board } = useAppStores();
  const items = ctx.itemsByRun.get(run.id) ?? [];
  const p = progress(items);
  const spent = spentOn(items);
  const who = run.shopperIds
    .map((id) => activeHelpers.find((h) => h.id === id))
    .map((h) => h && shortNameOf(h.name))
    .filter(Boolean);
  const task = run.ticketId ? board.tasks.find((t) => t.id === run.ticketId) : undefined;
  const meta = [
    run.shopOn && shortDate(run.shopOn),
    run.teamId && teams.teamById.get(run.teamId)?.name,
    who.length > 0 && who.join(", "),
    task && `on “${task.title}”`,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 py-3 text-left hover:bg-secondary/40"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{run.title}</span>
          <RunStatusPill status={run.status} />
        </span>
        {meta.length > 0 && (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {meta.join(" · ")}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {run.status === "ready" ? (
          <>
            <span className="block">
              {p.bought} of {p.total} bought
            </span>
            <span className="block">
              {fmtPeso(spent)}
              {run.cashGiven !== null && ` / ${fmtPeso(run.cashGiven)}`}
            </span>
          </>
        ) : (
          <>
            <span className="block">
              {p.total} {p.total === 1 ? "item" : "items"}
            </span>
            {run.cashGiven !== null && <span className="block">{fmtPeso(run.cashGiven)} cash</span>}
          </>
        )}
      </span>
    </button>
  );
}
