import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Station = "Yaya" | "Cook" | "Laundry" | "Driver" | "House";

interface PromoteVoiceTaskRequest {
  transcript: string;
  station?: Station;
  nowIso?: string;
}

// Local rule-based structurer for offline/mock mode, mirroring route-utos's
// parseMockUtos style. Applies the same station keyword rules as
// LINARA_MOBILE/aiagent.md Section 2.2 instruction 3.
function promoteMockVoiceTask(transcript: string, requestedStation?: Station) {
  const query = transcript.toLowerCase();

  let station: Station = requestedStation || "House";
  if (
    query.includes("bata") ||
    query.includes("gatas") ||
    query.includes("nursery") ||
    query.includes("baby")
  ) {
    station = "Yaya";
  } else if (
    query.includes("luto") ||
    query.includes("pantry") ||
    query.includes("palengke") ||
    query.includes("itlog")
  ) {
    station = "Cook";
  } else if (query.includes("laba") || query.includes("damit") || query.includes("labhan")) {
    station = "Laundry";
  } else if (query.includes("drive") || query.includes("sundo") || query.includes("kotse")) {
    station = "Driver";
  }

  let targetDateOffset = 0;
  if (query.includes("bukas")) {
    targetDateOffset = 1;
  } else if (query.includes("sa lunes") || query.includes("sa monday")) {
    targetDateOffset = 1;
  }

  const cleanTitle = transcript
    .replace(/^(ah,?\s*)?(kailangan ko pala|paki|please)/gi, "")
    .trim()
    .split(/[,.]/)[0]
    .trim();

  const subtasks = transcript
    .split(/,|tapos|then/gi)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return {
    cleanTitle: cleanTitle.length > 0 ? cleanTitle : transcript.trim(),
    note: transcript.trim(),
    station,
    targetDateOffset,
    targetTime: "09:00",
    subtasks: subtasks.length > 1 ? subtasks : [],
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

    const { transcript, station, nowIso }: PromoteVoiceTaskRequest = await req.json();

    if (!transcript || typeof transcript !== "string" || transcript.trim() === "") {
      return new Response(JSON.stringify({ error: "Missing or invalid transcript parameter" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const useMockAI = Deno.env.get("USE_MOCK_AI") === "true";
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("VOICE_PROMOTER_MODEL") || "gpt-4o-mini";

    if (useMockAI || !apiKey) {
      console.log(
        `[promote-voice-task] Returning mock response. Reason: useMockAI=${useMockAI}, apiKeyPresent=${!!apiKey}`,
      );
      const mockResult = promoteMockVoiceTask(transcript, station);
      return new Response(JSON.stringify(mockResult), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[promote-voice-task] Initiating live LLM request with model ${model}`);

    const systemPrompt = `You are the Linara Helper's Voice Assistant, a supportive, silent organizer that transforms raw Taglish (Filipino-English) transcripts into clean, formal task objects.

Your instructions:
1. Speak in a respectful, clear, and culturally native tone.
2. Clean up conversational fillers, redundant phrases, and verbal stumbles (e.g., map "Ah, kailangan ko pala bumili ng sabon mamaya" to "Bumili ng sabon").
3. Determine the correct Household Station for the task:
   - Tasks related to childcare, milk, baby bottles, or homework -> Yaya
   - Tasks related to ingredients, cooking, dishes, or wet market -> Cook
   - Tasks related to washing, folding, ironing, or dry cleaning -> Laundry
   - Tasks related to driving, car wash, airport runs, or fuel -> Driver
   - General cleaning, locking doors, organizing, or repairs -> House
4. Detect relative dates mentioned in the text (e.g., "mamaya" -> today, "bukas" -> tomorrow, "sa Lunes" -> next Monday) and compute the exact target date relative to the user's base simulation clock.
5. If the voice memo contains multiple distinct tasks, separate them into itemized sub-tasks.`;

    const userPrompt = `Structure this Taglish voice transcript into a formal task object:
Transcript: "${transcript}"
${station ? `Sender's station: "${station}"` : ""}
${nowIso ? `Current date/time (ground-truth base clock): "${nowIso}"` : ""}`;

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
            name: "voice_task_promotion",
            strict: true,
            schema: {
              type: "object",
              properties: {
                cleanTitle: { type: "string" },
                note: { type: "string" },
                station: { type: "string", enum: ["Yaya", "Cook", "Laundry", "Driver", "House"] },
                targetDateOffset: { type: "integer" },
                targetTime: { type: "string", pattern: "^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$" },
                subtasks: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: [
                "cleanTitle",
                "note",
                "station",
                "targetDateOffset",
                "targetTime",
                "subtasks",
              ],
              additionalProperties: false,
            },
          },
        },
        temperature: 0.1,
      }),
    });

    if (!openAIResponse.ok) {
      const errorBody = await openAIResponse.text();
      console.error("[promote-voice-task] OpenAI API error:", errorBody);
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
    console.error("[promote-voice-task] Fatal error processing request:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal Server Error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
