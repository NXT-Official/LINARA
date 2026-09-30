import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Wifi, WifiOff } from "lucide-react";

import { LogoMark } from "@/components/shared/logo";

import { useAppStores } from "../app-store-context";
import { EndOfDayToggle } from "./end-of-day-toggle";
// DISABLED 2026-08-15 (see use-sim-clock.ts / KNOWN_GAPS.md C28) -- time
// simulation caused real testing confusion. Re-enable by restoring this
// import and the <SimClock> render below.
// import { SimClock } from "./sim-clock";
import { ViewAsSwitcher } from "./view-as-switcher";

/** Brand, persona switcher, and (for on-site admins) the end-of-day toggle. */
export function TopBar() {
  const { session, board, isOnline, isOfflineSimulated, setOfflineSimulated } = useAppStores();
  const { currentAdminId, setCurrentAdminId, admins, adminType, status, logOut } = session;
  const navigate = useNavigate();
  const { boardClosed, setClosed: onBoardClosedChange } = board;
  const canEndDay = adminType === "primary" || adminType === "co";

  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-2.5 sm:px-6 sm:py-3">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Linara — home"
        >
          <LogoMark className="h-9 w-9 shrink-0" />
          <span className="min-w-0">
            <span className="block font-wordmark text-2xl font-semibold leading-none tracking-tight text-primary">
              linara
            </span>
            <span className="mt-0.5 hidden truncate text-xs text-muted-foreground md:block">
              Home, made clear.
            </span>
          </span>
        </Link>

        {/* Only a household with more than one admin has anyone to switch to.
            On a phone it takes its own full-width row. */}
        {admins.length > 1 && (
          <div className="order-last w-full sm:order-none sm:w-auto">
            <ViewAsSwitcher
              admins={admins}
              currentAdminId={currentAdminId}
              onSelectAdmin={setCurrentAdminId}
            />
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Being online is the normal case and says nothing; only a real
              drop earns header space. The simulate switch is a test aid. */}
          {!import.meta.env.DEV && !isOnline && (
            <span
              role="status"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"
            >
              <WifiOff className="h-3.5 w-3.5" />
              Offline
            </span>
          )}
          {import.meta.env.DEV && (
            <button
              onClick={() => setOfflineSimulated(!isOfflineSimulated)}
              aria-label={isOfflineSimulated ? "Simulate online" : "Simulate offline"}
              className={`inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1.5 text-xs font-semibold transition sm:px-2.5 ${
                isOfflineSimulated
                  ? "border-red-500/50 bg-red-500/10 text-red-600 hover:bg-red-500/20"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary/40"
              }`}
              title={isOfflineSimulated ? "Simulate Online" : "Simulate Offline"}
            >
              {isOfflineSimulated ? (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Dev: offline</span>
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Dev: online</span>
                </>
              )}
            </button>
          )}
          {/* DISABLED 2026-08-15 -- see use-sim-clock.ts. */}
          {/* <SimClock nowTs={nowTs} offsetMs={simOffsetMs} onChange={onSimOffsetChange} /> */}
          {canEndDay && <EndOfDayToggle closed={boardClosed} onChange={onBoardClosedChange} />}
          {status === "authed" && (
            <button
              onClick={() => {
                logOut();
                navigate({ to: "/login" });
              }}
              title="Log out"
              aria-label="Log out"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
