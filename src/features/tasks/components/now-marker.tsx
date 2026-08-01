export function NowMarker() {
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <span className="h-2 w-2 rounded-full bg-accent" />
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent-foreground/80">
        now
      </span>
      <span className="h-px flex-1 bg-accent/40" />
    </div>
  );
}
