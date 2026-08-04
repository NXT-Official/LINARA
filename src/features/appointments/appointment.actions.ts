import { createServerFn } from "@tanstack/react-start";

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
  const daysOfWeek = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
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
      console.log(
        `[ServerAction:parseSchedulerFn] Generating mock schedule for: "${prompt}"`,
      );
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
      } else if (
        query.includes("lunch") ||
        query.includes("dinner") ||
        query.includes("party")
      ) {
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

      if (
        query.includes("driver") ||
        query.includes("drive") ||
        query.includes("wake")
      ) {
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
      throw new Error(
        `Edge function returned error: ${response.status} ${errorText}`,
      );
    }

    const result = await response.json();
    return result as ParsedSchedule;
  });
