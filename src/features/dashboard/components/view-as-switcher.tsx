import { adminTypeShort } from "@/features/people/people.constants";
import type { Admin } from "@/features/people/people.types";

/** Switches between co-managers on the same household. */
export function ViewAsSwitcher({
  admins,
  currentAdminId,
  onSelectAdmin,
}: {
  admins: Admin[];
  currentAdminId: string;
  onSelectAdmin: (id: string) => void;
}) {
  const options = admins.map((a) => ({
    key: a.id,
    label: a.short,
    sub: adminTypeShort[a.type],
    active: currentAdminId === a.id,
    onSelect: () => onSelectAdmin(a.id),
  }));

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
