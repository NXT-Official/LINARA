import { Link, type LinkProps } from "@tanstack/react-router";
import type { ClipboardList } from "lucide-react";

export type BottomNavItem = {
  to: LinkProps["to"];
  label: string;
  Icon: typeof ClipboardList;
};

/**
 * Primary navigation: a floating pill that hugs its content on wide screens and
 * stretches edge-to-edge on a phone. Active state comes from the router — the
 * filled chip and the heavier label carry it too, so it never reads by colour
 * alone.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  return (
    <nav
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-6"
      aria-label="Primary"
    >
      <div className="pointer-events-auto flex w-full max-w-lg items-stretch gap-1 rounded-full border border-border/60 bg-card/85 p-1.5 shadow-lift backdrop-blur-xl sm:w-auto">
        {items.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-full px-2 py-2 text-[10px] font-semibold text-muted-foreground transition hover:bg-secondary/50 hover:text-foreground sm:px-5 sm:text-[11px]"
            activeProps={{ className: "bg-secondary text-primary" }}
          >
            {({ isActive }) => (
              <>
                <Icon className="h-5 w-5 shrink-0" />
                <span className={`truncate ${isActive ? "font-extrabold" : ""}`}>{label}</span>
              </>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
