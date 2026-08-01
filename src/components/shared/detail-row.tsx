// Two label/value row shapes used across the pay record and invite review screens.

export function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-semibold ${muted ? "text-muted-foreground" : "text-foreground"}`}>
        {value}
      </span>
    </div>
  );
}

export function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="text-right text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}
