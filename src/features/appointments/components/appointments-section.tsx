import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { stationTone } from "@/features/people/people.constants";
import { helperById } from "@/features/people/people.utils";
import type { Task } from "@/features/tasks/task.types";
import { formatAppointmentDate, parseTimeToMinutes, toISODate } from "@/lib/time";

import type { Appointment } from "../appointment.types";
import type { AppointmentStore } from "../hooks/use-appointments";
import { EditAppointmentModal } from "./edit-appointment-modal";
import { NewAppointmentModal } from "./new-appointment-modal";

/** Upcoming fixed events, each with the prep tasks it schedules. */
export function AppointmentsSection({
  appointments,
  tasks,
  simDate,
}: {
  appointments: AppointmentStore;
  tasks: Task[];
  simDate: Date;
}) {
  const { appointments: all, add: onAdd, remove: onRemove, update: onUpdate } = appointments;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const todayIso = toISODate(simDate);
  const upcoming = [...all]
    .filter((a) => a.date >= todayIso)
    .sort((a, b) =>
      a.date === b.date
        ? parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)
        : a.date < b.date
          ? -1
          : 1,
    );

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4 shadow-soft sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-pine-deep">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">
              Appointments · {upcoming.length}
            </div>
            <div className="text-xs text-muted-foreground">
              Fixed events. Prep tasks land on the board automatically.
            </div>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-soft hover:bg-primary/5"
        >
          <Plus className="h-3.5 w-3.5" /> New appointment
        </button>
      </div>

      {upcoming.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
          No upcoming appointments. Add one to schedule its prep automatically.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {upcoming.map((a) => {
            const preps = tasks
              .filter((t) => t.appointmentId === a.id)
              .sort(
                (x, y) =>
                  (x.scheduledDate ?? "").localeCompare(y.scheduledDate ?? "") ||
                  parseTimeToMinutes(x.time) - parseTimeToMinutes(y.time),
              );
            return (
              <li key={a.id} className="rounded-2xl border border-border/70 bg-background/60 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      <CalendarClock className="h-3 w-3" /> {formatAppointmentDate(a.date)} ·{" "}
                      {a.time}
                    </div>
                    <h4 className="mt-1.5 font-display text-lg text-foreground">{a.title}</h4>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => setEditing(a)}
                      className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onRemove(a.id)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label="Remove appointment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {preps.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
                    {preps.map((p) => {
                      const helper = helperById(p.helperId);
                      return (
                        <li key={p.id} className="flex items-start justify-between gap-2 text-xs">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-foreground">{p.title}</span>
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${stationTone[p.station]}`}
                              >
                                {p.station}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                              {formatAppointmentDate(p.scheduledDate ?? a.date)} · {p.time} ·{" "}
                              {helper.short}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <NewAppointmentModal
          onClose={() => setOpen(false)}
          onAdd={(a, preps) => {
            onAdd(a, preps);
            setOpen(false);
          }}
          defaultDate={toISODate(simDate)}
        />
      )}
      {editing && (
        <EditAppointmentModal
          appointment={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) => {
            onUpdate(editing.id, patch);
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
