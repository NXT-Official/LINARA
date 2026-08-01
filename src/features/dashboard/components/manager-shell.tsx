import type { ReactNode } from "react";

import { BottomNav } from "@/components/shared/bottom-nav";

import { MANAGER_NAV } from "../nav.constants";

/** Wrapper shared by every manager page: content well plus the primary nav. */
export function ManagerShell({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6 pb-24">
      {children}
      <BottomNav items={MANAGER_NAV} />
    </div>
  );
}
