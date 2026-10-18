import { Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";

import { BottomNav } from "@/components/shared/bottom-nav";
import { LogoMark } from "@/components/shared/logo";

import { usePlatformAdminSession } from "../hooks/use-platform-admin-session";
import { PLATFORM_ADMIN_NAV } from "../platform-admin-nav.constants";

/** Header (wordmark, pages on wide screens, way back, log out), content well, phone tab bar. */
export function PlatformAdminShell({ children }: { children: ReactNode }) {
  const { logOut } = usePlatformAdminSession();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-2.5 sm:px-6 sm:py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="h-9 w-9 shrink-0" />
            <span className="min-w-0">
              <span className="block font-wordmark text-2xl font-semibold leading-none tracking-tight text-primary">
                linara
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                Linara admin
              </span>
            </span>
          </div>

          <nav aria-label="Admin" className="ml-4 hidden items-center gap-1 lg:flex">
            {PLATFORM_ADMIN_NAV.map(({ to, label, Icon, exact }) => (
              <Link
                key={to}
                to={to}
                activeOptions={{ exact }}
                className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground"
                activeProps={{ className: "bg-secondary text-primary", "aria-current": "page" }}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              to="/manager/pass"
              className="inline-flex h-9 items-center rounded-lg px-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              Back to dashboard
            </Link>
            <button
              onClick={logOut}
              aria-label="Log out"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 pb-24 pt-6 sm:px-6 lg:pb-8">
        {children}
      </main>
      <BottomNav items={PLATFORM_ADMIN_NAV} />
    </div>
  );
}
