import { Link2 } from "lucide-react";

import { Avatar } from "@/components/shared/avatar";
import { PalengkeChip } from "@/features/groceries/components/palengke-chip";
import { stationTone } from "@/features/people/people.constants";
import type { Helper } from "@/features/people/people.types";
import { findHelper } from "@/features/people/people.utils";
import { formatAppointmentDate } from "@/lib/time";

import type { Task } from "../task.types";
import { recurrenceLabel } from "../task.utils";
import { RecurrenceBadge } from "./recurrence-badge";
import { RescheduleNotice } from "./reschedule-notice";

export function TaskCard({ task, helpers }: { task: Task; helpers: Helper[] }) {
  const helper = findHelper(task.helperId, helpers);
  return (
    <article className="group rounded-2xl ring-1 ring-border/20 bg-card p-3.5 shadow-soft transition hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-snug text-foreground">{task.title}</h4>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${task.helperId ? stationTone[task.station] : "bg-secondary text-muted-foreground"}`}
        >
          {task.helperId ? task.station : "Unassigned"}
        </span>
      </div>
      {(recurrenceLabel(task.recurrence) || task.appointmentTitle) && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <RecurrenceBadge recurrence={task.recurrence} />
          {task.appointmentTitle && (
            <span className="inline-flex items-center gap-1 rounded-full bg-terracotta-soft/70 px-2 py-0.5 text-xs font-medium text-[oklch(0.38_0.09_60)]">
              <Link2 className="h-2.5 w-2.5" /> {task.appointmentTitle}
            </span>
          )}
        </div>
      )}
      {task.scheduledDate && (
        <div className="mt-1 text-xs font-medium text-muted-foreground">
          {formatAppointmentDate(task.scheduledDate)}
        </div>
      )}
      <RescheduleNotice task={task} />
      {task.note && (
        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{task.note}</p>
      )}
      <PalengkeChip task={task} className="mt-2" />
      {task.photo && (
        <div className="mt-3 overflow-hidden rounded-xl">
          <img
            src={task.photoThumb ?? task.photo}
            alt=""
            className="h-28 w-full object-cover"
            loading="lazy"
          />
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
        <div className="mt-1.5 text-xs font-medium text-muted-foreground">
          from {task.createdBy}
        </div>
      )}
    </article>
  );
}
