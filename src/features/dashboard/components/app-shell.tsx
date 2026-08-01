import type { ReactNode } from "react";

import { TopBar } from "./top-bar";

/** Header + scrolling content well shared by every routed page. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 pb-24 pt-4 sm:px-6 sm:pt-6">{children}</main>
    </div>
  );
}
