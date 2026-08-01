import { adminTypeShort } from "@/features/people/people.constants";
import type { Admin, ViewAs } from "@/features/people/people.types";

export function ViewAsSwitcher({
  viewAs,
  onChange,
  admins,
}: {
  viewAs: ViewAs;
  onChange: (v: ViewAs) => void;
  admins: Admin[];
}) {
  const options: Array<{ key: ViewAs; label: string; sub: string }> = [
    ...admins.map((a) => ({ key: a.id as ViewAs, label: a.short, sub: adminTypeShort[a.type] })),
    { key: "rosa", label: "Rosa", sub: "Helper" },
  ];
  return (
    <div className="inline-flex shrink-0 flex-col items-start gap-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        View as
      </div>
      <div className="inline-flex rounded-full border border-border bg-card p-1 shadow-soft">
        {options.map((opt) => {
          const active = viewAs === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => onChange(opt.key)}
              className={`flex flex-col items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-tight transition sm:px-3 sm:text-xs ${
                active
                  ? "bg-primary text-primary-foreground shadow-soft"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{opt.label}</span>
              <span
                className={`text-[9px] font-medium ${active ? "text-primary-foreground/80" : "text-muted-foreground/70"}`}
              >
                {opt.sub}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
