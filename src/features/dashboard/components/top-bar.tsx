import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Wifi, WifiOff } from "lucide-react";
import { useState } from "react";

import { LogoMark } from "@/components/shared/logo";
import { Modal } from "@/components/shared/modal";
import { HouseholdSwitcher } from "@/features/people/components/household-switcher";

import { useAppStores } from "../app-store-context";
import { MANAGER_NAV } from "../nav.constants";
// DISABLED 2026-08-15 (see use-sim-clock.ts / KNOWN_GAPS.md C28) -- time
// simulation caused real testing confusion. Re-enable by restoring this
// import and the <SimClock> render below.
// import { SimClock } from "./sim-clock";

/**
 * Brand, the five pages (on wide screens), household switcher, and log out.
 * "End the day" lives on the Pass. Below `lg` the pages are the bottom bar
 * instead: a floating phone tab bar on a desktop monitor was the odd one out
 * (UX review 2026-10-07).
 */
export function TopBar() {
  const { session, isOnline, isOfflineSimulated, setOfflineSimulated } = useAppStores();
  const { status, logOut } = session;
  const navigate = useNavigate();
  const [confirmingLogOut, setConfirmingLogOut] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background backdrop-blur-xl supports-[backdrop-filter]:bg-background/90">
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
            <span className="mt-0.5 hidden truncate text-xs text-muted-foreground md:block lg:hidden xl:block">
              Home, made clear.
            </span>
          </span>
        </Link>

        {status === "authed" && (
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 lg:flex">
            {MANAGER_NAV.map(({ to, label, Icon }) => (
              <Link
                key={to}
                to={to}
                className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground"
                activeProps={{
                  className: "bg-secondary text-primary",
                  "aria-current": "page",
                }}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
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
              className={`hidden shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition sm:inline-flex ${
                isOfflineSimulated
                  ? "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary/40"
              }`}
              title={isOfflineSimulated ? "Simulate Online" : "Simulate Offline"}
            >
              {isOfflineSimulated ? (
                <>
                  <WifiOff className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline lg:hidden xl:inline">Dev: offline</span>
                </>
              ) : (
                <>
                  <Wifi className="h-3.5 w-3.5 text-status-done-ink" />
                  <span className="hidden sm:inline lg:hidden xl:inline">Dev: online</span>
                </>
              )}
            </button>
          )}
          {status === "authed" && <HouseholdSwitcher />}
          {/* DISABLED 2026-08-15 -- see use-sim-clock.ts. */}
          {/* <SimClock nowTs={nowTs} offsetMs={simOffsetMs} onChange={onSimOffsetChange} /> */}
          {status === "authed" && (
            <button
              onClick={() => setConfirmingLogOut(true)}
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
      {/* On a phone this is a bare icon beside the household switcher, and in
          the app logging out also signs the app out, so a stray tap cost a
          full sign-in (QA LMM-A5). */}
      {confirmingLogOut && (
        <Modal onClose={() => setConfirmingLogOut(false)}>
          <h3 className="font-display text-lg text-foreground">Log out?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            You'll need your email and password to sign back in.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={() => setConfirmingLogOut(false)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                logOut();
                navigate({ to: "/login", replace: true });
              }}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:bg-pine-deep"
            >
              Log out
            </button>
          </div>
        </Modal>
      )}
    </header>
  );
}
