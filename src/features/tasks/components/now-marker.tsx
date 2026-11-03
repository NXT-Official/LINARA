import { useT } from "@/lib/i18n/locale-context";

export function NowMarker() {
  const t = useT();
  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <span className="h-2 w-2 rounded-full bg-accent" />
      <span className="text-xs font-bold text-accent-foreground/80">{t("tasks.now")}</span>
      <span className="h-px flex-1 bg-accent/40" />
    </div>
  );
}
