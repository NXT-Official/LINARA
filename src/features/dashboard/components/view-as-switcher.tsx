import { useMatchRoute, useNavigate } from "@tanstack/react-router";

import { adminTypeShort } from "@/features/people/people.constants";
import type { Admin, Helper } from "@/features/people/people.types";

/**
 * The prototype's persona switcher. Which persona you are is the route — the
 * helper lives under /helper, the admins under /manager — so switching personas
 * is a navigation, not a piece of state. Swapping admins inside the manager
 * branch leaves you on the page you were already reading.
 */
export function ViewAsSwitcher({
  admins,
  currentAdminId,
  onSelectAdmin,
  helper,
}: {
  admins: Admin[];
  currentAdminId: string;
  onSelectAdmin: (id: string) => void;
  /** The real active helper to view as -- the first ACTIVE helper_profiles row
   * (see KNOWN_GAPS.md gap C8), or null until one has claimed their account. */
  helper: Helper | null;
}) {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const inHelperView = !!matchRoute({ to: "/helper", fuzzy: true });

  const options = [
    ...admins.map((a) => ({
      key: a.id,
      label: a.short,
      sub: adminTypeShort[a.type],
      active: !inHelperView && currentAdminId === a.id,
      onSelect: () => {
        onSelectAdmin(a.id);
        if (inHelperView) navigate({ to: "/manager/pass" });
      },
    })),
    ...(helper
      ? [
          {
            key: helper.id,
            label: helper.short,
            sub: "Helper",
            active: inHelperView,
            onSelect: () => {
              if (!inHelperView) navigate({ to: "/helper/today" });
            },
          },
        ]
      : []),
  ];

  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground lg:inline"
      >
        View as
      </span>
      <div
        role="group"
        aria-label="View as"
        className="flex w-full items-center rounded-full border border-border/60 bg-card/80 p-1 shadow-soft backdrop-blur sm:w-auto"
      >
        {options.map((opt) => (
          <button
            key={opt.key}
            onClick={opt.onSelect}
            aria-pressed={opt.active}
            className={`flex flex-1 flex-col items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-tight transition sm:flex-none sm:px-3.5 sm:text-xs ${
              opt.active
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            <span>{opt.label}</span>
            <span
              className={`text-[9px] font-medium ${opt.active ? "text-primary-foreground/80" : "text-muted-foreground/70"}`}
            >
              {opt.sub}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
