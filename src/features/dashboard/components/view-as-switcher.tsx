import { useMatchRoute, useNavigate } from "@tanstack/react-router";

import { adminTypeShort } from "@/features/people/people.constants";
import type { Admin } from "@/features/people/people.types";

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
}: {
  admins: Admin[];
  currentAdminId: string;
  onSelectAdmin: (id: string) => void;
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
    {
      key: "rosa",
      label: "Rosa",
      sub: "Helper",
      active: inHelperView,
      onSelect: () => {
        if (!inHelperView) navigate({ to: "/helper/today" });
      },
    },
  ];

  return (
    <div className="inline-flex shrink-0 flex-col items-start gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        View as
      </div>
      <div className="inline-flex rounded-full border border-border bg-card p-1 shadow-soft">
        {options.map((opt) => (
          <button
            key={opt.key}
            onClick={opt.onSelect}
            aria-pressed={opt.active}
            className={`flex flex-col items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-tight transition sm:px-3 sm:text-xs ${
              opt.active
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:text-foreground"
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
