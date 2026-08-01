import { Moon } from "lucide-react";

export function EndOfDayToggle({
  closed,
  onChange,
}: {
  closed: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!closed)}
      role="switch"
      aria-checked={closed}
      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold shadow-soft transition sm:text-xs ${
        closed
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground"
      }`}
    >
      <Moon className="h-3.5 w-3.5" />
      <span className="whitespace-nowrap">Simulate end of day</span>
      <span
        className={`relative h-4 w-7 rounded-full transition ${closed ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-card shadow transition-all ${closed ? "left-3.5" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}
