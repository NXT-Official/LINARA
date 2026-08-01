import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

import { useAppStores } from "../app-store-context";
import { EndOfDayToggle } from "./end-of-day-toggle";
import { SimClock } from "./sim-clock";
import { ViewAsSwitcher } from "./view-as-switcher";

/** Brand, persona switcher, demo clock, and (for on-site admins) the end-of-day toggle. */
export function TopBar() {
  const { session, board, clock } = useAppStores();
  const { currentAdminId, setCurrentAdminId, admins, adminType } = session;
  const { boardClosed, setClosed: onBoardClosedChange } = board;
  const { nowTs, offsetMs: simOffsetMs, setOffsetMs: onSimOffsetChange } = clock;
  const canEndDay = adminType === "primary" || adminType === "co";

  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-2.5 sm:px-6 sm:py-3">
        <Link
          to="/"
          className="group flex min-w-0 items-center gap-2.5 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Linara — home"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft transition group-hover:shadow-lift">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-2xl font-semibold leading-none tracking-tight text-primary">
              linara
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              Home, made clear.
            </span>
          </span>
        </Link>

        {/* On a phone the switcher drops to its own full-width row. */}
        <div className="order-last w-full sm:order-none sm:w-auto">
          <ViewAsSwitcher
            admins={admins}
            currentAdminId={currentAdminId}
            onSelectAdmin={setCurrentAdminId}
          />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SimClock nowTs={nowTs} offsetMs={simOffsetMs} onChange={onSimOffsetChange} />
          {canEndDay && <EndOfDayToggle closed={boardClosed} onChange={onBoardClosedChange} />}
        </div>
      </div>
    </header>
  );
}
