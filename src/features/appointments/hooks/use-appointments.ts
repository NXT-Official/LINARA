import { useState } from "react";

import { helperById } from "@/features/people/people.utils";
import type { Task } from "@/features/tasks/task.types";
import { computePrepSchedule } from "@/lib/time";

import { INITIAL_APPOINTMENTS } from "../appointment.constants";
import type { Appointment, PrepDraft } from "../appointment.types";

export type AppointmentStore = ReturnType<typeof useAppointments>;

/**
 * Fixed calendar events and the prep tasks scheduled backwards from them.
 *
 * Prep tasks live on the board, so this hook drives them through the board's
 * `setTasks`: adding an appointment creates them, removing it deletes them, and
 * moving it shifts each one by its own lead offset (leaving a reschedule notice).
 */
export function useAppointments(setTasks: (update: (prev: Task[]) => Task[]) => void) {
  const [appointments, setAppointments] = useState<Appointment[]>(INITIAL_APPOINTMENTS);

  const add = (a: Omit<Appointment, "id">, preps: PrepDraft[]) => {
    const id = `a${Date.now()}`;
    setAppointments((prev) => [...prev, { ...a, id }]);
    const newTasks: Task[] = preps.map((p, i) => {
      const { date, time } = computePrepSchedule(a.date, a.time, p.leadMinutes);
      const helper = helperById(p.helperId);
      return {
        id: `${id}-p${i}-${Date.now()}`,
        title: p.title,
        note: p.note,
        time,
        helperId: p.helperId,
        station: helper.station,
        status: "todo",
        appointmentId: id,
        appointmentTitle: a.title,
        scheduledDate: date,
        leadMinutes: p.leadMinutes,
      };
    });
    if (newTasks.length > 0) setTasks((prev) => [...prev, ...newTasks]);
  };

  const remove = (id: string) => {
    setAppointments((prev) => prev.filter((a) => a.id !== id));
    setTasks((prev) => prev.filter((t) => t.appointmentId !== id));
  };

  const update = (id: string, patch: { title: string; date: string; time: string }) => {
    setAppointments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    setTasks((prev) =>
      prev.map((t) => {
        if (t.appointmentId !== id) return t;
        const lead = t.leadMinutes ?? 0;
        const { date: newDate, time: newTime } = computePrepSchedule(patch.date, patch.time, lead);
        const changed =
          newDate !== t.scheduledDate || newTime !== t.time || patch.title !== t.appointmentTitle;
        if (!changed) return { ...t, appointmentTitle: patch.title };
        const timeMoved = newDate !== t.scheduledDate || newTime !== t.time;
        return {
          ...t,
          time: newTime,
          scheduledDate: newDate,
          appointmentTitle: patch.title,
          rescheduleNotice: timeMoved
            ? { oldTime: t.time, oldDate: t.scheduledDate, appointmentTitle: patch.title }
            : t.rescheduleNotice,
        };
      }),
    );
  };

  return { appointments, add, remove, update };
}
