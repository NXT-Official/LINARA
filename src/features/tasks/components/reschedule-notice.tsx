import { History } from "lucide-react";

import { useT } from "@/lib/i18n/locale-context";
import { richText } from "@/lib/i18n/rich-text";

import type { Task } from "../task.types";

/**
 * "Moved from 6:00 PM when Dinner at Lola's changed", or "Moved from 6:00 PM
 * by Ana": shown on a task whose time shifted, so a co-manager looking at the
 * board knows the time isn't the one they planned. Gone once the task is done.
 */
export function RescheduleNotice({ task }: { task: Task }) {
  const t = useT();
  const notice = task.rescheduleNotice;
  if (!notice || task.status === "done") return null;
  const from = notice.movedFrom ? t("tasks.movedFromPart", { time: notice.movedFrom }) : "";
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs leading-snug text-muted-foreground">
      <History className="mt-0.5 h-3 w-3 shrink-0 text-terracotta-ink" aria-hidden />
      <span>
        {notice.appointmentTitle
          ? richText(t("tasks.movedWhenAppointmentChanged"), {
              from,
              appointment: (
                <span className="font-semibold text-foreground">{notice.appointmentTitle}</span>
              ),
            })
          : notice.movedBy
            ? richText(t("tasks.movedByPerson"), {
                from,
                by: <span className="font-semibold text-foreground">{notice.movedBy}</span>,
              })
            : t("tasks.movedPlain", { from })}
      </span>
    </p>
  );
}
