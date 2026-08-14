import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createAppointmentFn,
  deleteAppointmentFn,
  listAppointmentsFn,
  rescheduleAppointmentFn,
  type AppointmentRow,
} from "../appointment.actions";
import type { Appointment, PrepDraft } from "../appointment.types";
import {
  combineDateAndTime,
  computePrepSchedule,
  isoToDisplayTime,
  isoToISODate,
} from "@/lib/time";

export type AppointmentStore = ReturnType<typeof useAppointments>;

function toAppointment(row: AppointmentRow): Appointment {
  return {
    id: row.id,
    title: row.title,
    date: isoToISODate(row.scheduled_time),
    time: isoToDisplayTime(row.scheduled_time),
    recipeType: row.recipe_type ?? undefined,
  };
}

/**
 * Fixed calendar events and the prep tasks scheduled backwards from them.
 *
 * Real Supabase-backed as of KNOWN_GAPS.md Closed Gap C14 -- fetched on
 * mount/token-change and refetched after every write, same "write then
 * refresh" pattern as the rest of this app. add()/remove()/update() each
 * call one SECURITY DEFINER RPC (see appointment.actions.ts) that writes the
 * appointment row and its prep `tickets` rows in a single transaction,
 * rather than two sequential calls that could leave them out of sync.
 */
export function useAppointments({
  token,
  ready,
  refreshTasks,
}: {
  token: string | null;
  ready: boolean;
  refreshTasks: () => void | Promise<void>;
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const rows = await listAppointmentsFn({ data: { token } });
    setAppointments(rows.map(toAppointment));
  }, [token]);

  useEffect(() => {
    if (!ready || !token) return;
    refresh().catch((err) => {
      console.error("[useAppointments] Failed to load appointments:", err);
    });
  }, [ready, token, refresh]);

  const add = (a: Omit<Appointment, "id">, preps: PrepDraft[]) => {
    if (!token) return;
    createAppointmentFn({
      data: {
        token,
        title: a.title,
        scheduledTimeIso: combineDateAndTime(a.date, a.time),
        recipeType: a.recipeType,
        preps: preps.map((p) => {
          const { date, time } = computePrepSchedule(a.date, a.time, p.leadMinutes);
          return {
            title: p.title,
            notes: p.note,
            helperId: p.helperId,
            scheduledStartIso: combineDateAndTime(date, time),
            leadMinutes: p.leadMinutes,
          };
        }),
      },
    })
      .then(() => Promise.all([refresh(), refreshTasks()]))
      .catch((err) => {
        console.error("[useAppointments] Failed to create appointment:", err);
        toast.error("Hindi na-save ang appointment.");
      });
  };

  const remove = (id: string) => {
    if (!token) return;
    deleteAppointmentFn({ data: { token, appointmentId: id } })
      .then(() => Promise.all([refresh(), refreshTasks()]))
      .catch((err) => {
        console.error("[useAppointments] Failed to remove appointment:", err);
        toast.error("Hindi na-delete ang appointment.");
      });
  };

  const update = (id: string, patch: { title: string; date: string; time: string }) => {
    if (!token) return;
    rescheduleAppointmentFn({
      data: {
        token,
        appointmentId: id,
        title: patch.title,
        scheduledTimeIso: combineDateAndTime(patch.date, patch.time),
      },
    })
      .then(() => Promise.all([refresh(), refreshTasks()]))
      .catch((err) => {
        console.error("[useAppointments] Failed to reschedule appointment:", err);
        toast.error("Hindi na-reschedule ang appointment.");
      });
  };

  return { appointments, add, remove, update, refresh };
}
