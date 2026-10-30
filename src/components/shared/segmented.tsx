import type { ComponentType } from "react";

/**
 * One choice among a few, shown side by side: the Pass layout, the Schedule
 * and People sections, the plan's view. Every option is a 44px target, one
 * look everywhere (UI/UX audit 2026-10-29: they were 30–32px and each page
 * drew its own).
 */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** What the group switches, for screen readers: "Pass layout". */
  label: string;
  options: readonly { key: K; label: string; Icon?: ComponentType<{ className?: string }> }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div
      className="inline-flex rounded-xl border border-border bg-card p-0.5 shadow-soft"
      role="group"
      aria-label={label}
    >
      {options.map(({ key, label: text, Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-sm font-semibold transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0 ${
              active
                ? "bg-primary text-primary-foreground shadow-soft"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
            }`}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden />}
            {text}
          </button>
        );
      })}
    </div>
  );
}
