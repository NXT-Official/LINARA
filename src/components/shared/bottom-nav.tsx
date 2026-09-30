import { Link, type LinkProps } from "@tanstack/react-router";
import type { ClipboardList } from "lucide-react";

export type BottomNavItem = {
  to: LinkProps["to"];
  label: string;
  Icon: typeof ClipboardList;
};

/**
 * Primary navigation. On a phone it is a standard tab bar: full width, flush
 * to the bottom edge, with the home-indicator inset inside it rather than a
 * floating pill hovering over content. From `sm` it becomes a centred dock.
 * Modals (z-50) sit above it. Active state comes from the router and is shown
 * by the tinted tile, the icon colour and the heavier label -- never by colour
 * alone.
 */
export function BottomNav({ items }: { items: BottomNavItem[] }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:pointer-events-none sm:border-t-0 sm:bg-transparent sm:px-6 sm:pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:backdrop-blur-none"
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-lg items-stretch gap-1 px-2 py-1.5 sm:pointer-events-auto sm:w-fit sm:rounded-2xl sm:border sm:border-border sm:bg-card/95 sm:p-1.5 sm:shadow-lift sm:backdrop-blur-xl">
        {items.map(({ to, label, Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground sm:px-5"
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
