import { useMounted } from "@/hooks/use-mounted";
import { formatTimeOfDay } from "@/lib/time";

import type { RosaStatus } from "../availability.types";
import { statusMeta } from "../availability.utils";
import { richText } from "@/lib/i18n/rich-text";
import { useT } from "@/lib/i18n/locale-context";

export function RosaStatusChip({ status, helperName }: { status: RosaStatus; helperName: string }) {
  const t = useT();
  const mounted = useMounted();
  const meta = statusMeta(mounted ? status.status : "off");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.cls}`}
      title={`${helperName}'s live status`}
      suppressHydrationWarning
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {helperName} · {mounted ? meta.label : "—"}
      {mounted && status.status === "available" && status.until && (
        <span className="font-normal opacity-80">
          {richText(t("availability.until"), { value: formatTimeOfDay(status.until) })}
        </span>
      )}
    </span>
  );
}
