import { Link, type LinkProps } from "@tanstack/react-router";
import type { ClipboardList } from "lucide-react";

export type BottomNavItem = {
  to: LinkProps["to"];
  label: string;
  Icon: typeof ClipboardList;
};

/**
 * Primary navigation. Active state comes from the router — the bar above the
 * icon and the heavier label carry it too, so it never reads by colour alone.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-6xl items-stretch justify-around px-2 sm:px-6">
        {items.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-1 flex-col items-center gap-0.5 rounded-2xl px-2 pb-2.5 pt-1.5 text-[11px] font-semibold text-muted-foreground transition hover:text-foreground"
            activeProps={{ className: "text-primary" }}
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={`h-0.5 w-6 rounded-full ${isActive ? "bg-primary" : "bg-transparent"}`}
                />
                <Icon className="h-5 w-5" />
                <span className={isActive ? "font-extrabold" : undefined}>{label}</span>
              </>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
