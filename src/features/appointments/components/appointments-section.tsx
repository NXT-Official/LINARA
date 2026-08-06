import { CalendarClock, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { HELPERS, stationTone } from "@/features/people/people.constants";
import { helperById } from "@/features/people/people.utils";
import type { Task } from "@/features/tasks/task.types";
import {
  formatAppointmentDate,
  formatDisplayTime,
  parseTimeToMinutes,
  toISODate,
} from "@/lib/time";
import { parseSchedulerFn } from "../appointment.actions";
import type { PrepDraft } from "../appointment.types";

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
  const [prompt, setPrompt] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);

  const handleAISchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsScheduling(true);
    try {
      const result = await parseSchedulerFn({
        data: {
          prompt: prompt.trim(),
          simDate: simDate.toISOString(),
        },
      });

      if (result) {
        const dt = new Date(result.appointment.scheduledTime);
        const dateIso = toISODate(dt);
        const timeDisplay = formatDisplayTime(dt.getHours() * 60 + dt.getMinutes());

        const preps: PrepDraft[] = result.prepTasks.map((p) => {
          const helper =
            HELPERS.find((h) => h.station.toLowerCase() === p.station.toLowerCase()) || HELPERS[0];
          return {
            title: p.title,
            leadMinutes: -p.offsetMinutes, // mathematically maps offset to leadMinutes (e.g. -720 -> 720, 60 -> -60)
            helperId: helper.id,
          };
        });

        onAdd(
          {
            title: result.appointment.title,
            date: dateIso,
            time: timeDisplay,
          },
          preps,
        );

        setPrompt("");
        toast.success("Successfully scheduled appointment and all prep tasks with AI!");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to parse and schedule with AI. Please try again.");
    } finally {
      setIsScheduling(false);
    }
  };

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

      <form onSubmit={handleAISchedule} className="mb-4">
        <div className="flex gap-2 rounded-2xl border border-border/80 bg-background/50 p-1.5 focus-within:border-primary">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isScheduling}
            placeholder="✨ e.g., Flight on Friday at 8am, pack bags 12h before"
            className="flex-1 bg-transparent px-3 py-2 text-xs outline-none text-foreground placeholder:text-muted-foreground/70"
          />
          <button
            type="submit"
            disabled={isScheduling || !prompt.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:bg-pine-deep disabled:opacity-40"
          >
            {isScheduling ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Scheduling...
              </>
            ) : (
              <>
                <Sparkles className="h-3 w-3" />
                Schedule
              </>
            )}
          </button>
        </div>
      </form>

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
