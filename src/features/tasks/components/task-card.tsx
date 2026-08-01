import { Link2 } from "lucide-react";

import { Avatar } from "@/components/shared/avatar";
import { PalengkeChip } from "@/features/groceries/components/palengke-chip";
import { stationTone } from "@/features/people/people.constants";
import { helperById } from "@/features/people/people.utils";
import { formatAppointmentDate } from "@/lib/time";

import type { Task } from "../task.types";
import { isPalengke, recurrenceLabel } from "../task.utils";
import { RecurrenceBadge } from "./recurrence-badge";

export function TaskCard({ task }: { task: Task }) {
  const helper = helperById(task.helperId);
  return (
    <article className="group rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft transition hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-snug text-foreground">{task.title}</h4>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${stationTone[task.station]}`}
        >
          {task.station}
        </span>
      </div>
      {(recurrenceLabel(task.recurrence) || task.appointmentTitle) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <RecurrenceBadge recurrence={task.recurrence} />
          {task.appointmentTitle && (
            <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-2 py-0.5 text-[10px] font-medium text-[oklch(0.38_0.09_60)]">
              <Link2 className="h-2.5 w-2.5" /> {task.appointmentTitle}
            </span>
          )}
        </div>
      )}
      {task.scheduledDate && (
        <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {formatAppointmentDate(task.scheduledDate)}
        </div>
      )}
      {task.note && (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{task.note}</p>
      )}
      {isPalengke(task) && (
        <div className="mt-2">
          <PalengkeChip />
        </div>
      )}
      {task.photo && (
        <div className="mt-3 overflow-hidden rounded-xl">
          <img src={task.photo} alt="" className="h-28 w-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar initials={helper.initials} />
          <span className="text-xs font-medium text-foreground">{helper.short}</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground">{task.time}</span>
      </div>
      {task.createdBy && (
        <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          from {task.createdBy}
        </div>
      )}
    </article>
  );
}
