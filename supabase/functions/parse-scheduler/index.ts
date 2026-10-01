import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface SchedulerRequest {
  prompt: string;
  simDate?: string; // the board's day with the household's offset, e.g. "2026-10-01T00:00:00+08:00"
}

// Helper to find the next occurrence of a specific weekday starting from baseline Date
function getNextWeekdayDate(baseDate: Date, targetDayStr: string): Date {
  const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const targetDay = daysOfWeek.indexOf(targetDayStr.toLowerCase().trim());
  if (targetDay === -1) return new Date(baseDate);

  const result = new Date(baseDate);
  const currentDay = result.getUTCDay();
  let daysToAdd = targetDay - currentDay;
  if (daysToAdd < 0) {
    daysToAdd += 7; // Next week's occurrence
  }
  result.setUTCDate(result.getUTCDate() + daysToAdd);
  return result;
}

// The board's day and the household's UTC offset, from householdDayStamp()
// ("2026-10-01T00:00:00+08:00"). Day math runs on the UTC fields of a date
// at UTC midnight, so it never depends on the zone this code runs in -- UTC on
// the server, anything on a dev machine (KNOWN_GAPS.md O9). An older caller's
// plain ISO instant still works, read as a Manila day.
function parseDayStamp(stamp?: string): { day: Date; offset: string } {
  const m = stamp?.match(/^(\d{4})-(\d{2})-(\d{2})T00:00:00([+-]\d{2}:\d{2})$/);
  if (m) return { day: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), offset: m[4] };
  const manila = new Date((stamp ? new Date(stamp) : new Date()).getTime() + 8 * 3_600_000);
  return {
    day: new Date(Date.UTC(manila.getUTCFullYear(), manila.getUTCMonth(), manila.getUTCDate())),
    offset: "+08:00",
  };
}

// The instant the household's clock reads `hour`:00 on `day`.
function atHouseholdHour(day: Date, hour: number, offset: string): Date {
  const ymd = day.toISOString().slice(0, 10);
  return new Date(`${ymd}T${String(hour).padStart(2, "0")}:00:00${offset}`);
}

// Local mock parser for offline development
function parseMockSchedule(prompt: string, simDateStr?: string) {
  const query = prompt.toLowerCase();
  const { day: baseline, offset } = parseDayStamp(simDateStr);

  // Default targets
  let targetDate = new Date(baseline);
  let title = "Calendar Appointment";

  // Parse Date keywords (e.g. Friday, Monday)
  const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  for (const day of weekdays) {
    if (query.includes(day)) {
      targetDate = getNextWeekdayDate(baseline, day);
      break;
    }
  }

  // Parse Time keywords
  let hour = 8; // default
  if (query.includes("8am") || query.includes("8:00")) {
    hour = 8;
  } else if (query.includes("6am") || query.includes("6:00")) {
    hour = 6;
  } else if (query.includes("12pm") || query.includes("12:00")) {
    hour = 12;
  } else if (query.includes("2pm") || query.includes("14:00")) {
    hour = 14;
  }
  const scheduledAt = atHouseholdHour(targetDate, hour, offset);

  // Parse Title keyword
  if (query.includes("flight") || query.includes("airport")) {
    title = "Sir Ben's Flight to Singapore";
  } else if (query.includes("lunch") || query.includes("dinner") || query.includes("party")) {
    title = "Family Sunday Dinner";
  } else if (query.includes("doctor") || query.includes("checkup") || query.includes("dentist")) {
    title = "Sofia's Pediatrician Appointment";
  } else {
    title = prompt.split(",")[0].trim();
  }

  // Parse prepTasks
  const prepTasks = [];

  // Parse "pack bags 12h before" or similar
  if (query.includes("pack") || query.includes("bag")) {
    let offset = -720; // 12 hours
    if (query.includes("10h") || query.includes("10 hours")) {
      offset = -600;
    }
    prepTasks.push({
      title: "Pack luggage bags",
      station: "Yaya",
      offsetMinutes: offset,
    });
  }

  // Parse "wake driver 45 mins before" or similar
  if (query.includes("driver") || query.includes("drive") || query.includes("wake")) {
    prepTasks.push({
      title: "Wake Kuya Manuel (Driver)",
      station: "Driver",
      offsetMinutes: -45,
    });
  }

  // Parse "prep lunch" or "cook"
  if (
    query.includes("cook") ||
    query.includes("lunch") ||
    query.includes("meal") ||
    query.includes("baon")
  ) {
    prepTasks.push({
      title: "Prepare meal provisions",
      station: "Cook",
      offsetMinutes: -120,
    });
  }

  // If no prep tasks were detected, add one generic
  if (prepTasks.length === 0) {
    prepTasks.push({
      title: "Final preparation checks",
      station: "House",
      offsetMinutes: -60,
    });
  }

  return {
    appointment: {
      title,
      scheduledTime: scheduledAt.toISOString(),
    },
    prepTasks,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { prompt, simDate }: SchedulerRequest = await req.json();

    if (!prompt || typeof prompt !== "string" || prompt.trim() === "") {
      return new Response(JSON.stringify({ error: "Missing or invalid prompt parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const useMockAI = Deno.env.get("USE_MOCK_AI") === "true";
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("UTOS_ROUTER_MODEL") || "gpt-4o-mini";

    if (useMockAI || !apiKey) {
      console.log(
        `[parse-scheduler] Returning mock response. Reason: useMockAI=${useMockAI}, apiKeyPresent=${!!apiKey}`,
      );
      const mockResult = parseMockSchedule(prompt, simDate);
      return new Response(JSON.stringify(mockResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[parse-scheduler] Initiating live LLM request with model ${model}`);

    const baseClockContext = simDate
      ? `The current baseline simulation clock is: "${simDate}"`
      : "";

    const systemPrompt = `You are the Linara Temporal Scheduler, a specialized assistant for household organization. Your job is to extract calendar anchors (appointments) and parse relative dependent preparation sequences.

Rules of execution:
1. Identify the core "Anchor Event" (the appointment) with its title and local date/time. Map it to an ISO 8601 timestamp using the baseline simulation clock date context. The baseline carries the household's UTC offset (e.g. +08:00): times the user says are the household's local time, so write the timestamp with that same offset.
2. Identify all relative preparation tasks. Convert lead times expressed in natural language ("12h before", "10 hours before", "45 mins before") into negative integers representing minutes relative to the anchor (e.g. -720 for 12 hours before).
3. If the user states a task should happen "after", convert it to positive offset minutes.
4. Set default roles/stations based on context keywords:
   - "pack", "feed", "nursery" -> Yaya
   - "cook", "baon", "meal", "pantry", "palengke" -> Cook
   - "wash", "laundry", "shirts" -> Laundry
   - "drive", "airport", "pickup", "dropoff" -> Driver
   - General cleaning or multi-use tasks -> House
5. Do NOT hallucinate dates. Use the provided user's base simulation time as the ground-truth anchor.`;

    const userPrompt = `${baseClockContext}

Parse this input instruction text into structured JSON:
Input: "${prompt}"`;

    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "anchor_schedule",
            strict: true,
            schema: {
              type: "object",
              properties: {
                appointment: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    scheduledTime: { type: "string" },
                  },
                  required: ["title", "scheduledTime"],
                  additionalProperties: false,
                },
                prepTasks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      station: {
                        type: "string",
                        enum: ["Yaya", "Cook", "Laundry", "Driver", "House"],
                      },
                      offsetMinutes: { type: "integer" },
                    },
                    required: ["title", "station", "offsetMinutes"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["appointment", "prepTasks"],
              additionalProperties: false,
            },
          },
        },
        temperature: 0.1,
      }),
    });

    if (!openAIResponse.ok) {
      const errorBody = await openAIResponse.text();
      console.error("[parse-scheduler] OpenAI API error:", errorBody);
      throw new Error(`OpenAI API returned status ${openAIResponse.status}`);
    }

    const openAIData = await openAIResponse.json();
    const resultString = openAIData.choices?.[0]?.message?.content;

    if (!resultString) {
      throw new Error("No structured completion returned from OpenAI");
    }

    const parsedResult = JSON.parse(resultString);
    return new Response(JSON.stringify(parsedResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[parse-scheduler] Fatal error processing request:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
