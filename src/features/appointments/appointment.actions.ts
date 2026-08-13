import { createServerFn } from "@tanstack/react-start";

import { createAuthedClient } from "@/lib/supabase";
import { isoToDisplayTime, isoToISODate } from "@/lib/time";

export interface ParsedSchedule {
  appointment: {
    title: string;
    scheduledTime: string; // ISO 8601 string
  };
  prepTasks: Array<{
    title: string;
    station: "Yaya" | "Cook" | "Laundry" | "Driver" | "House";
    offsetMinutes: number; // e.g. -720, -45
  }>;
}

// Helper to compute weekday date based on baseline
function getNextWeekdayDate(baseDate: Date, targetDayStr: string): Date {
  const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const targetDay = daysOfWeek.indexOf(targetDayStr.toLowerCase().trim());
  if (targetDay === -1) return new Date(baseDate);

  const result = new Date(baseDate);
  const currentDay = result.getDay();
  let daysToAdd = targetDay - currentDay;
  if (daysToAdd < 0) {
    daysToAdd += 7; // Next week's occurrence
  }
  result.setDate(result.getDate() + daysToAdd);
  return result;
}

/**
 * Server function to parse natural language scheduler instructions.
 * Proxies to Supabase parse-scheduler Edge Function or runs local mock.
 */
export const parseSchedulerFn = createServerFn({ method: "POST" })
  .validator((data: { prompt: string; simDate?: string }) => data)
  .handler(async ({ data }) => {
    const { prompt, simDate } = data;
    const useMock = process.env.USE_MOCK_AI === "true" || !process.env.SUPABASE_URL;

    if (useMock) {
      console.log(`[ServerAction:parseSchedulerFn] Generating mock schedule for: "${prompt}"`);
      // Simulate small delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      const query = prompt.toLowerCase();
      const baseline = simDate ? new Date(simDate) : new Date();

      let targetDate = new Date(baseline);
      let title = "Calendar Appointment";

      const weekdays = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ];
      for (const day of weekdays) {
        if (query.includes(day)) {
          targetDate = getNextWeekdayDate(baseline, day);
          break;
        }
      }

      if (query.includes("8am") || query.includes("8:00")) {
        targetDate.setHours(8, 0, 0, 0);
      } else if (query.includes("6am") || query.includes("6:00")) {
        targetDate.setHours(6, 0, 0, 0);
      } else if (query.includes("12pm") || query.includes("12:00")) {
        targetDate.setHours(12, 0, 0, 0);
      } else if (query.includes("2pm") || query.includes("14:00")) {
        targetDate.setHours(14, 0, 0, 0);
      } else {
        targetDate.setHours(8, 0, 0, 0);
      }

      if (query.includes("flight") || query.includes("airport")) {
        title = "Sir Ben's Flight to Singapore";
      } else if (query.includes("lunch") || query.includes("dinner") || query.includes("party")) {
        title = "Family Sunday Dinner";
      } else if (
        query.includes("doctor") ||
        query.includes("checkup") ||
        query.includes("dentist")
      ) {
        title = "Sofia's Pediatrician Appointment";
      } else {
        const parts = prompt.split(",");
        title = parts[0].trim();
      }

      const prepTasks = [];

      if (query.includes("pack") || query.includes("bag")) {
        let offset = -720; // 12 hours
        if (query.includes("10h") || query.includes("10 hours")) {
          offset = -600;
        }
        prepTasks.push({
          title: "Pack luggage bags",
          station: "Yaya" as const,
          offsetMinutes: offset,
        });
      }

      if (query.includes("driver") || query.includes("drive") || query.includes("wake")) {
        prepTasks.push({
          title: "Wake Kuya Manuel (Driver)",
          station: "Driver" as const,
          offsetMinutes: -45,
        });
      }

      if (
        query.includes("cook") ||
        query.includes("lunch") ||
        query.includes("meal") ||
        query.includes("baon")
      ) {
        prepTasks.push({
          title: "Prepare meal provisions",
          station: "Cook" as const,
          offsetMinutes: -120,
        });
      }

      if (prepTasks.length === 0) {
        prepTasks.push({
          title: "Final preparation checks",
          station: "House" as const,
          offsetMinutes: -60,
        });
      }

      return {
        appointment: {
          title,
          scheduledTime: targetDate.toISOString(),
        },
        prepTasks,
      };
    }

    const url = `${process.env.SUPABASE_URL}/functions/v1/parse-scheduler`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ prompt, simDate }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function returned error: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return result as ParsedSchedule;
  });

// --------------------------------------------------------------------------
// Real appointments + atomic prep-ticket writes -- closes KNOWN_GAPS.md gap
// #7 (Closed Gap C14). create/reschedule/delete each call a SECURITY
// DEFINER RPC (supabase/add-appointment-atomic-writes.sql) so the
// appointment row and its prep `tickets` rows never end up out of sync --
// replaces the old two-sequential-calls approach (local appointment state +
// a separate tickets write) from Closed Gap C12.
// --------------------------------------------------------------------------

export interface AppointmentRow {
  id: string;
  title: string;
  scheduled_time: string;
  recipe_type: string | null;
}

/** Lists every appointment in the caller's household. appointments_isolation
 * (architecture.md Section 8) is a plain household-scoped FOR ALL policy, so
 * a direct authed select works -- no RPC needed for reads. */
export const listAppointmentsFn = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const { token } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error } = await authedClient
      .from("appointments")
      .select("*")
      .order("scheduled_time", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (rows ?? []) as AppointmentRow[];
  });

export interface PrepTicketDraft {
  title: string;
  notes?: string;
  helperId: string;
  scheduledStartIso: string;
  leadMinutes: number;
}

/** Creates an appointment and every prep ticket in one transaction (see
 * create_appointment_with_preps). Manager-only, enforced inside the RPC. */
export const createAppointmentFn = createServerFn({ method: "POST" })
  .validator(
    (data: {
      token: string;
      title: string;
      scheduledTimeIso: string;
      recipeType?: string;
      preps: PrepTicketDraft[];
    }) => data,
  )
  .handler(async ({ data }) => {
    const { token, title, scheduledTimeIso, recipeType, preps } = data;

    const authedClient = createAuthedClient(token);
    const { data: appointmentId, error } = await authedClient.rpc("create_appointment_with_preps", {
      p_title: title,
      p_scheduled_time: scheduledTimeIso,
      p_recipe_type: recipeType ?? null,
      p_preps: preps.map((p) => ({
        title: p.title,
        notes: p.notes ?? null,
        helper_id: p.helperId,
        scheduled_start: p.scheduledStartIso,
        lead_minutes: p.leadMinutes,
      })),
    });

    if (error || !appointmentId) {
      throw new Error(error?.message || "Failed to create appointment");
    }

    return { id: appointmentId as string };
  });

/** Reschedules an appointment and every prep ticket tied to it in one
 * transaction (see reschedule_appointment_with_preps). Fetches the current
 * tickets first to compute each one's new scheduled_start (from its stored
 * lead_minutes) and a reschedule_notice banner, but only for tickets whose
 * time actually moved -- a title-only edit doesn't get one, and omitting the
 * key (not passing null) for an unmoved ticket lets the RPC's COALESCE
 * preserve whatever notice was already there. Manager-only, enforced inside
 * the RPC. */
export const rescheduleAppointmentFn = createServerFn({ method: "POST" })
  .validator(
    (data: { token: string; appointmentId: string; title: string; scheduledTimeIso: string }) =>
      data,
  )
  .handler(async ({ data }) => {
    const { token, appointmentId, title, scheduledTimeIso } = data;

    const authedClient = createAuthedClient(token);
    const { data: rows, error: fetchError } = await authedClient
      .from("tickets")
      .select("id, scheduled_start, lead_minutes")
      .eq("appointment_id", appointmentId);

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    const newApptTime = new Date(scheduledTimeIso).getTime();
    const ticketUpdates = (rows ?? []).map((r) => {
      const leadMs = (r.lead_minutes ?? 0) * 60_000;
      const newScheduledStartIso = new Date(newApptTime - leadMs).toISOString();
      const timeMoved = newScheduledStartIso !== r.scheduled_start;
      const base = { id: r.id, scheduled_start: newScheduledStartIso };
      return timeMoved
        ? {
            ...base,
            reschedule_notice: {
              oldTime: isoToDisplayTime(r.scheduled_start),
              oldDate: isoToISODate(r.scheduled_start),
              appointmentTitle: title,
            },
          }
        : base;
    });

    const { error } = await authedClient.rpc("reschedule_appointment_with_preps", {
      p_appointment_id: appointmentId,
      p_title: title,
      p_scheduled_time: scheduledTimeIso,
      p_ticket_updates: ticketUpdates,
    });

    if (error) {
      throw new Error(error.message);
    }
  });

/** Deletes an appointment; ON DELETE CASCADE (see the migration) takes care
 * of its prep tickets. Manager-only, enforced inside the RPC. */
export const deleteAppointmentFn = createServerFn({ method: "POST" })
  .validator((data: { token: string; appointmentId: string }) => data)
  .handler(async ({ data }) => {
    const { token, appointmentId } = data;

    const authedClient = createAuthedClient(token);
    const { error } = await authedClient.rpc("delete_appointment_with_preps", {
      p_appointment_id: appointmentId,
    });

    if (error) {
      throw new Error(error.message);
    }
  });
