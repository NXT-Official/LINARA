import { Sparkles } from "lucide-react";

import type { Session } from "@/features/people/hooks/use-session";
import type { TaskBoard } from "@/features/tasks/hooks/use-task-board";

import type { SimClock as SimClockState } from "../hooks/use-sim-clock";
import { EndOfDayToggle } from "./end-of-day-toggle";
import { SimClock } from "./sim-clock";
import { ViewAsSwitcher } from "./view-as-switcher";

/** Brand, persona switcher, demo clock, and (for on-site admins) the end-of-day toggle. */
export function TopBar({
  session,
  board,
  clock,
}: {
  session: Session;
  board: TaskBoard;
  clock: SimClockState;
}) {
  const { viewAs, setViewAs: onViewAsChange, admins, adminType } = session;
  const { boardClosed, setClosed: onBoardClosedChange } = board;
  const { nowTs, offsetMs: simOffsetMs, setOffsetMs: onSimOffsetChange } = clock;
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
